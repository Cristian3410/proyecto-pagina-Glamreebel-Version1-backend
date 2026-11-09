import { pool } from "../db/database.js";
import { checkEmailExistsQuery } from "../queries/queries.js";
import { MercadoPagoConfig, Preference } from "mercadopago";
import nodemailer from 'nodemailer';
import { processImage } from "../helpers/imageProcessor.js";
import { MP_ACCESS_TOKEN, MP_NOTIFICATION_URL, SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT, SMTP_SECURE, ADMIN_ORDER_EMAIL } from "../config/config.js";

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });

export const verifyEmailExist = async (req, res) => {
    const { correo } = req.body;
    if (!correo) {
        return res.status(400).json("error los campos estan vacios");
    }
    const result = await pool.query(checkEmailExistsQuery, [correo]);
    if (result.rows.length === 0) {
        return res.status(200).json({ exists: false });
    }
    return res.status(200).json({ exists: true });
};

export const createOrderAndPreference = async (req, res) => {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const { items, shippingData, totalPrice, shippingCost } = req.body;

    const connection = await pool.connect();

    try {
        if (!userId || !userEmail) {
            return res.status(401).json({ success: false, message: "Usuario no autenticado o token inválido" });
        }

        await connection.query('BEGIN');

        const orderQuery = `
            INSERT INTO orders (
                user_id, total, status, shipping_status, payment_method, 
                shipping_name, shipping_apellido, shipping_cedula, 
                shipping_phone, shipping_address, shipping_city,
                shipping_barrio, shipping_localidad, shipping_email
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
            RETURNING id;
        `;
        
        const orderValues = [
            userId,
            totalPrice,
            'Pendiente de pago',
            'Pendiente',
            'Mercado Pago',
            shippingData?.shipping_name || '',
            shippingData?.shipping_apellido || '',
            shippingData?.shipping_cedula || '',
            shippingData?.shipping_phone || '',
            shippingData?.shipping_address || '',
            shippingData?.shipping_city || '',
            shippingData?.shipping_barrio || '',
            shippingData?.shipping_localidad || '',
            userEmail
        ];

        const orderResult = await connection.query(orderQuery, orderValues);
        const orderId = orderResult.rows[0].id;

        const preferenceItems = [];

        for (const item of items) {
            const itemQuery = `
                INSERT INTO order_items (order_id, product_id, quantity, price, product_name)
                VALUES ($1, $2, $3, $4, $5);
            `;
            const numericPrice = item.numericPrice || parseFloat(String(item.price).replace(/[^0-9]/g, ''));
            await connection.query(itemQuery, [
                orderId,
                item.product_id || item.id,
                item.quantity,
                numericPrice,
                item.name || item.product_name
            ]);

            preferenceItems.push({
                id: String(item.product_id || item.id),
                title: item.name || item.product_name,
                quantity: Number(item.quantity),
                unit_price: Number(numericPrice),
                currency_id: "COP"
            });
        }

        const parsedShippingCost = Number(shippingCost) || 0;
        if (parsedShippingCost > 0) {
            preferenceItems.push({
                id: "shipping-bogota",
                title: "Costo de envío - Bogotá",
                quantity: 1,
                unit_price: parsedShippingCost,
                currency_id: "COP"
            });
        }

        const preference = new Preference(client);
        const preferenceData = {
            items: preferenceItems,
            external_reference: String(orderId),
            notification_url: MP_NOTIFICATION_URL,
            back_urls: {
                success: `https://glamreebel.com/checkout/success?order_id=${orderId}`,
                failure: `https://glamreebel.com/checkout/failure?order_id=${orderId}`,
                pending: `https://glamreebel.com/checkout/pending?order_id=${orderId}`
            },
            auto_return: "approved"
        };

        const result = await preference.create({ body: preferenceData });

        await connection.query('COMMIT');
        return res.json({ success: true, init_point: result.init_point });
    } catch (error) {
        await connection.query('ROLLBACK');
        console.error("Error al crear orden o preferencia:", error);
        return res.status(500).json({ success: false, message: "Error al procesar el pago" });
    } finally {
        connection.release();
    }
};

export const updateOrderStatus = async (req, res) => {
    const { orderId, status } = req.body;
    
    if (!orderId || !status) {
        return res.status(400).json({ success: false, message: "Faltan datos obligatorios" });
    }

    try {
        const allowedStatuses = ['Pendiente de pago', 'Rechazado', 'En proceso'];
        if (status === 'Aprobado') return res.status(403).json({ success: false, message: 'El estado Aprobado solo lo confirma Mercado Pago' });
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Estado no válido" });
        }

        const result = await pool.query(
            "UPDATE orders SET status = $1 WHERE id = $2 RETURNING id", 
            [status, orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        return res.json({ success: true, message: "Estado de orden actualizado con éxito" });
    } catch (error) {
        console.error("Error al actualizar orden:", error);
        return res.status(500).json({ success: false, message: "Error al actualizar estado" });
    }
};

export const updateShippingStatus = async (req, res) => {
 const {orderId,shipping_status}=req.body||{}; const allowed=["Pendiente","En preparación","Despachado","Entregado"];
 if(!Number.isInteger(Number(orderId))||Number(orderId)<=0)return res.status(400).json({success:false,message:"El número de pedido no es válido"});
 if(!allowed.includes(shipping_status))return res.status(400).json({success:false,message:"Estado de envío no válido"});
 try {const r=await pool.query("UPDATE orders SET shipping_status=$1 WHERE id=$2 AND status='Aprobado' RETURNING id",[shipping_status,Number(orderId)]);
 if(!r.rows.length)return res.status(404).json({success:false,message:"No existe un pedido pagado con ese número"});
 return res.json({success:true,message:"Estado de envío actualizado con éxito"});}
 catch(error){console.error("Error al actualizar el estado de envío:",error.message);return res.status(500).json({success:false,message:"Error al actualizar el estado de envío"});}
};

export const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT 
                o.id AS order_id,
                o.total,
                o.status,
                o.shipping_status,
                o.payment_method,
                o.created_at,
                o.shipping_name,
                o.shipping_apellido,
                o.shipping_cedula,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_city,
                o.shipping_barrio,
                o.shipping_localidad,
                oi.id AS item_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                oi.product_name
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC;
        `;
        const result = await pool.query(query, [userId]);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const ordersMap = {};
        rows.forEach(row => {
            if (!ordersMap[row.order_id]) {
                ordersMap[row.order_id] = {
                    id: row.order_id,
                    total: row.total,
                    status: row.status,
                    shipping_status: row.shipping_status,
                    payment_method: row.payment_method,
                    created_at: row.created_at,
                    shippingData: {
                        shipping_name: row.shipping_name,
                        shipping_apellido: row.shipping_apellido,
                        shipping_cedula: row.shipping_cedula,
                        shipping_phone: row.shipping_phone,
                        shipping_address: row.shipping_address,
                        shipping_city: row.shipping_city,
                        shipping_barrio: row.shipping_barrio,
                        shipping_localidad: row.shipping_localidad
                    },
                    items: []
                };
            }
            ordersMap[row.order_id].items.push({
                id: row.item_id,
                product_id: row.product_id,
                quantity: row.quantity,
                price: row.price,
                product_name: row.product_name
            });
        });

        const formattedOrders = Object.values(ordersMap);
        return res.status(200).json({
            success: true,
            data: formattedOrders
        });
    } catch (error) {
        console.error("Error al obtener los pedidos:", error);
        return res.status(500).json({
            success: false,
            message: "Error interno en el servidor"
        });
    }
};

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

export const probarConexionCorreo = async (req, res) => {
  try {
    await transporter.verify();
    return res.status(200).json({ 
      exito: true, 
      mensaje: "¡Conexión y credenciales de cPanel verificadas correctamente!" 
    });
  } catch (error) {
    console.error("Error detallado de autenticación:", error);
    return res.status(500).json({ 
      exito: false, 
      error: error.message,
      codigo: error.code || 'DESCONOCIDO'
    });
  }
};

export const receiveWebhook = async (req, res) => {
    const body = req.body || {};
    console.log("[WEBHOOK] Notificación recibida de Mercado Pago");

    // Si se "reclama" el envío de correos y algo falla, se libera en el catch para que MP reintente
    let claimedEmailOrderId = null;

    try {
        // MP puede enviar los datos en el body (webhooks) o en la query (IPN: ?topic=payment&id=123)
        const topic = body.type || body.topic || req.query.type || req.query.topic;

        if (topic === 'payment') {
            const paymentId = body.data?.id || req.query["data.id"] || req.query.id || body.id;

            if (!paymentId) {
                console.log("[WEBHOOK] No se encontró el ID del pago.");
                return res.status(400).json({ error: 'No se encontró el ID del pago' });
            }

            // Consultar la información del pago en Mercado Pago usando fetch nativo
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
                }
            });

            if (!mpResponse.ok) {
                console.error(`[WEBHOOK] Error consultando el pago ${paymentId} en MP: HTTP ${mpResponse.status}`);
                return res.status(500).json({ error: 'No se pudo consultar el pago en Mercado Pago' });
            }

            const paymentData = await mpResponse.json();

            
            const externalReference = paymentData.external_reference; 
            const status = paymentData.status; 
            const statusDetail = paymentData.status_detail;
            
            console.log(`[WEBHOOK] Status: ${status}`);
console.log(`[WEBHOOK] Status Detail: ${statusDetail}`);

            console.log(`[WEBHOOK] Pago ID: ${paymentId}, Orden ID: ${externalReference}, Status MP: ${status}`);

            if (!externalReference) {
                return res.status(200).json({ message: 'Pago sin external_reference, ignorado' });
            }

            const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [externalReference]);

            if (orderResult.rows.length === 0) {
                console.log(`[WEBHOOK] Orden #${externalReference} no encontrada en la base de datos.`);
                return res.status(404).json({ error: 'Orden no encontrada en la base de datos' });
            }

            const currentOrder = orderResult.rows[0];

            let dbStatus = status;
            if (status === 'approved') dbStatus = 'Aprobado';
            else if (status === 'pending' || status === 'in_process') dbStatus = 'Pendiente de pago';
            else if (status === 'rejected' || status === 'cancelled') dbStatus = 'Rechazado';

            const isApprovedNow = dbStatus === 'Aprobado';

            // Un intento rechazado que llegue tarde no debe pisar una orden ya aprobada
            if (currentOrder.status === 'Aprobado' && !isApprovedNow) {
                console.log(`[WEBHOOK] Orden #${externalReference} ya aprobada; se ignora el estado '${status}' del pago ${paymentId}.`);
                return res.status(200).json({ received: true });
            }

            // No retroceder un envío que el admin ya movió a 'En preparación' o 'Despachado'
            const newShippingStatus = isApprovedNow && currentOrder.shipping_status === 'Pendiente'
                ? 'Pagado'
                : currentOrder.shipping_status;

            // Actualizar estado y shipping_status en la base de datos
            await pool.query(
                'UPDATE orders SET status = $1, shipping_status = $2 WHERE id = $3',
                [dbStatus, newShippingStatus, externalReference]
            );
            console.log(`[WEBHOOK] Orden #${externalReference} actualizada en BD -> Status: ${dbStatus}, Shipping Status: ${newShippingStatus}`);

            if (isApprovedNow) {
                // Reclamo atómico: solo una notificación envía los correos, aunque MP mande varias
                const claim = await pool.query(
                    'UPDATE orders SET email_sent = true WHERE id = $1 AND email_sent = false RETURNING id',
                    [externalReference]
                );
                if (claim.rows.length === 0) {
                    console.log(`[WEBHOOK] Correos de la orden #${externalReference} ya enviados, se omite.`);
                    return res.status(200).json({ received: true });
                }
                claimedEmailOrderId = externalReference;

                const orderQuery = `
                    SELECT o.*, oi.product_name, oi.quantity, oi.price 
                    FROM orders o 
                    JOIN order_items oi ON o.id = oi.order_id 
                    WHERE o.id = $1
                `;
                const orderDetailResult = await pool.query(orderQuery, [externalReference]);

                if (orderDetailResult.rows.length > 0) {
                    const orderRows = orderDetailResult.rows;
                    const firstRow = orderRows[0];

                    let productsHtml = '';
                    orderRows.forEach(item => {
                        productsHtml += `
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.product_name}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
                                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(item.price).toLocaleString()} COP</td>
                            </tr>
                        `;
                    });

                    // 1. CORREO PARA EL ADMINISTRADOR (Gmail)
                    const adminMailOptions = {
                        from: `"Glam Reebel Notificaciones" <${SMTP_USER}>`,
                        to: ADMIN_ORDER_EMAIL,
                        subject: `🎉 ¡Nuevo Pago Aprobado! - Orden #${externalReference}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
                                <h2 style="color: #d63384; text-align: center;">¡Nuevo Pedido Pagado Exitosamente!</h2>
                                <p>Se ha confirmado un pago a través de Mercado Pago para la orden <strong>#${externalReference}</strong>.</p>
                                
                                <h3 style="border-bottom: 2px solid #d63384; padding-bottom: 5px; color: #444;">📦 Detalle de los Productos</h3>
                                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                    <thead>
                                        <tr style="background-color: #f8f9fa;">
                                            <th style="padding: 8px; text-align: left;">Producto</th>
                                            <th style="padding: 8px; text-align: center;">Cant.</th>
                                            <th style="padding: 8px; text-align: right;">Precio Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${productsHtml}
                                    </tbody>
                                </table>
                                <p style="text-align: right; font-size: 16px;"><strong>Total Pagado: </strong>$${Number(firstRow.total).toLocaleString()} COP</p>

                                <h3 style="border-bottom: 2px solid #d63384; padding-bottom: 5px; color: #444; margin-top: 20px;">👤 Datos del Cliente y Envío</h3>
                                <ul style="list-style: none; padding: 0; line-height: 1.6;">
                                    <li><strong>Nombre:</strong> ${firstRow.shipping_name} ${firstRow.shipping_apellido}</li>
                                    <li><strong>Cédula / NIT:</strong> ${firstRow.shipping_cedula || 'No especificada'}</li>
                                    <li><strong>Correo Electrónico:</strong> ${firstRow.shipping_email || 'No especificado'}</li>
                                    <li><strong>Teléfono:</strong> ${firstRow.shipping_phone}</li>
                                    <li><strong>Dirección:</strong> ${firstRow.shipping_address}</li>
                                    <li><strong>Barrio:</strong> ${firstRow.shipping_barrio || 'N/A'}</li>
                                    <li><strong>Localidad / Ciudad:</strong> ${firstRow.shipping_localidad || ''} - ${firstRow.shipping_city}</li>
                                    <li><strong>Método de Pago:</strong> ${firstRow.payment_method} (ID Pago MP: ${paymentId})</li>
                                </ul>
                            </div>
                        `
                    };

                    await transporter.sendMail(adminMailOptions);
                    console.log(`[WEBHOOK] Correo enviado al admin para la orden #${externalReference}`);

                    // 2. CORREO PARA EL CLIENTE
                    const clientEmail = firstRow.shipping_email;
                    if (clientEmail) {
                        const clientMailOptions = {
                            from: `"Glam Reebel" <${SMTP_USER}>`,
                            to: clientEmail,
                            subject: `¡Confirmación de tu compra! - Orden #${externalReference}`,
                            html: `
                                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
                                    <h2 style="color: #d63384; text-align: center;">¡Gracias por tu compra en Glam Rebel!</h2>
                                    <p>Hemos recibido el pago exitoso de tu orden <strong>#${externalReference}</strong>. Estamos preparando tus productos para el envío.</p>
                                    
                                    <h3 style="border-bottom: 2px solid #d63384; padding-bottom: 5px; color: #444;">📦 Resumen de tu pedido</h3>
                                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                        <thead>
                                            <tr style="background-color: #f8f9fa;">
                                                <th style="padding: 8px; text-align: left;">Producto</th>
                                                <th style="padding: 8px; text-align: center;">Cant.</th>
                                                <th style="padding: 8px; text-align: right;">Precio Unit.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${productsHtml}
                                        </tbody>
                                    </table>
                                    <p style="text-align: right; font-size: 16px;"><strong>Total Pagado: </strong>$${Number(firstRow.total).toLocaleString()} COP</p>
                                </div>
                            `
                        };

                        await transporter.sendMail(clientMailOptions);
                        console.log(`[WEBHOOK] Correo enviado al cliente (${clientEmail}) para la orden #${externalReference}`);
                    }
                }
            }
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error('[WEBHOOK ERROR]:', error);
        if (claimedEmailOrderId) {
            // Falló el envío: liberar la marca para que el reintento de MP vuelva a enviar los correos
            await pool.query('UPDATE orders SET email_sent = false WHERE id = $1', [claimedEmailOrderId])
                .catch(err => console.error('[WEBHOOK] No se pudo liberar email_sent:', err));
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const deleteOrder = async (req, res) => {
    const userId = req.user?.id;
    const { id } = req.params;

    const connection = await pool.connect();

    try {
        if (!userId) {
            return res.status(401).json({ success: false, message: "No autorizado" });
        }

        const orderCheck = await connection.query(
            "SELECT * FROM orders WHERE id = $1 AND user_id = $2", 
            [id, userId]
        );
        
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Pedido no encontrado" });
        }

        const order = orderCheck.rows[0];
        const statusLower = (order.status || "").toLowerCase();

        if (statusLower.includes("aprobado") || statusLower.includes("approved")) {
            return res.status(400).json({ success: false, message: "No puedes eliminar un pedido que ya ha sido aprobado." });
        }

        await connection.query('BEGIN');
        await connection.query("DELETE FROM order_items WHERE order_id = $1", [id]);
        await connection.query("DELETE FROM orders WHERE id = $1", [id]);
        await connection.query('COMMIT');

        return res.status(200).json({ success: true, message: "Pedido eliminado con éxito" });

    } catch (error) {
        await connection.query('ROLLBACK');
        console.error("Error al eliminar el pedido:", error);
        return res.status(500).json({ success: false, message: "Error interno del servidor" });
    } finally {
        connection.release();
    }
};

export const getAllOrdersAdmin = async (req, res) => {
    try {
        const query = `
            SELECT 
                o.id AS order_id,
                o.total,
                o.status,
                o.shipping_status,
                o.payment_method,
                o.created_at,
                o.shipping_name,
                o.shipping_apellido,
                o.shipping_cedula,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_city,
                o.shipping_barrio,
                o.shipping_localidad,
                o.shipping_email,
                oi.id AS item_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                oi.product_name,
                p.image AS product_image
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON p.id::text = oi.product_id::text
            ORDER BY o.created_at DESC;
        `;
        const result = await pool.query(query);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const ordersMap = {};
        rows.forEach(row => {
            if (!ordersMap[row.order_id]) {
                ordersMap[row.order_id] = {
                    id: row.order_id,
                    total: row.total,
                    status: row.status,
                    shipping_status: row.shipping_status,
                    payment_method: row.payment_method,
                    created_at: row.created_at,
                    shippingData: {
                        shipping_name: row.shipping_name,
                        shipping_apellido: row.shipping_apellido,
                        shipping_cedula: row.shipping_cedula,
                        shipping_phone: row.shipping_phone,
                        shipping_address: row.shipping_address,
                        shipping_city: row.shipping_city,
                        shipping_barrio: row.shipping_barrio,
                        shipping_localidad: row.shipping_localidad,
                        shipping_email: row.shipping_email
                    },
                    items: []
                };
            }
            if (row.item_id !== null) {
                ordersMap[row.order_id].items.push({
                    id: row.item_id, product_id: row.product_id, quantity: row.quantity,
                    price: row.price, product_name: row.product_name, product_image: row.product_image
                });
            }
        });

        const formattedOrders = Object.values(ordersMap);
        return res.status(200).json({
            success: true,
            data: formattedOrders
        });
    } catch (error) {
        console.error("Error al obtener todas las órdenes (Admin):", error);
        return res.status(500).json({
            success: false,
            message: "Error interno en el servidor"
        });
    }
};

export const testOrderEmail = async (req, res) => {
    try {
        const orderId = req.params.id; 
        const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: "Orden no encontrada" });
        }

        const orden = orderResult.rows[0];
        const items = itemsResult.rows;

        const itemsHtml = items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${Number(item.price).toLocaleString()} COP</td>
            </tr>
        `).join('');

        const formattedTotal = Number(orden.total).toLocaleString();

        await transporter.sendMail({
            from: `"Glam Reebel" <${SMTP_USER}>`,
            to: orden.shipping_email, 
            subject: `TEST - Pedido #${orderId}`,
            html: `<h1>Prueba de correo</h1><p>Total: $${formattedTotal}</p><table>${itemsHtml}</table>`
        });

        return res.json({ success: true, message: "Correo de prueba enviado con éxito" });
    } catch (error) {
        console.error("Error en prueba de correo:", error);
        return res.status(500).json({ error: error.message });
    }
};

export const getAllUsersAdmin = async (req, res) => {
    try {
        // Nunca exponer password_hash ni credenciales en el panel.
        const result = await pool.query("SELECT id, name, email, role FROM users ORDER BY id DESC");
        return res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error("Error al consultar usuarios para el administrador:", error.message);
        return res.status(500).json({ success: false, message: "Error interno en el servidor" });
    }
};

export const getProductsInventory = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id ASC');
        
        const formattedProducts = result.rows.map(product => {
            let imagesArray = product.images;

            if (typeof imagesArray === 'string') {
                imagesArray = imagesArray
                    .replace(/[{}]/g, '') 
                    .split(',')         
                    .map(img => img.trim().replace(/^"(.*)"$/, '$1')); 
            }

            if (!Array.isArray(imagesArray)) {
                imagesArray = product.image ? [product.image] : [];
            }

            return {
                ...product,
                images: imagesArray
            };
        });

        return res.status(200).json(formattedProducts);
    } catch (error) {
        console.error("Error al obtener el inventario:", error);
        return res.status(500).json({ success: false, message: "Error interno en el servidor" });
    }
};

export const updateProductStock = async (req,res)=>{
 const {id}=req.params; const {stock,colors}=req.body||{}; const n=Number(stock);
 if(!Number.isInteger(n)||n<0)return res.status(400).json({success:false,message:"El stock debe ser un entero mayor o igual a cero"});
 try {const r=colors===undefined?await pool.query("UPDATE products SET stock=$1 WHERE id=$2 RETURNING *",[n,id]):await pool.query("UPDATE products SET stock=$1,colors=$2 WHERE id=$3 RETURNING *",[n,JSON.stringify(colors),id]);
 if(!r.rows.length)return res.status(404).json({success:false,message:"Producto no encontrado"});
 return res.status(200).json({success:true,message:"Stock actualizado correctamente",product:r.rows[0]});}
 catch(error){console.error("Error al actualizar el stock:",error.message);return res.status(500).json({success:false,message:"Error interno en el servidor"});}
};

export const createProductWithMultipleImages = async (req, res) => {
    try {
        const { brand, category, name, price, stock, description } = req.body;
        
        const files = req.files || [];
        let imagePaths = [];
        
        if (files.length > 0) {
            const processPromises = files.map(file => processImage(file));
            imagePaths = await Promise.all(processPromises);
        }

        const primaryImage = imagePaths.length > 0 ? imagePaths[0] : null;

        const query = `
            INSERT INTO products (brand, category, name, price, stock, image, description, images) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *;
        `;
        
        const values = [
            brand, 
            category, 
            name, 
            price, 
            stock || 0, 
            primaryImage, 
            description, 
            imagePaths 
        ];

        const result = await pool.query(query, values);

        return res.status(201).json({
            status: "ok",
            message: "Producto y sus imágenes optimizadas guardados con éxito",
            product: result.rows[0]
        });

    } catch (error) {
        console.error("Error al registrar el producto con imágenes:", error);
        return res.status(500).json({ success: false, message: "Error interno al procesar las imágenes" });
    }
};