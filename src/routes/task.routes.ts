import { Router } from "express";
import { 
    verifyEmailExist, 
    createOrderAndPreference, 
    updateOrderStatus, 
    getMyOrders, 
    testOrderEmail,
    receiveWebhook,
    deleteOrder, 
    updateShippingStatus, 
    getAllOrdersAdmin,
    getAllUsersAdmin,
    getProductsInventory,
    updateProductStock,
    createProductWithMultipleImages,
    probarConexionCorreo // <-- 1. Importa tu nueva función de prueba aquí
} from "../controllers/taskcontrollers.js";
import { accessRequired, adminRequired } from "../middlewares/validatorToken.js";

const router = Router();

router.post("/verifyEmail", verifyEmailExist);
router.post("/CheckMercadoPago", accessRequired, createOrderAndPreference);
// Solo el admin puede cambiar el estado a mano; los pagos los confirma el webhook
router.post("/update-order-status", accessRequired, adminRequired, updateOrderStatus);
router.get('/orders/my-orders', accessRequired, getMyOrders);
router.post("/webhook",receiveWebhook);
router.delete("/deleteMyOrder/:id", accessRequired, deleteOrder);
router.get("/test-email/:id", accessRequired, adminRequired, testOrderEmail);

// 2. Agrega la nueva ruta para verificar la conexión SMTP de Google directamente
router.get("/probar-conexion-correo", accessRequired, adminRequired, probarConexionCorreo);

// Ruta pública para cargar productos y stock real
router.get("/products", getProductsInventory);

// Rutas protegidas exclusivamente para el administrador
router.put("/update-shipping-status", accessRequired, adminRequired, updateShippingStatus);
router.get('/admin/orders', accessRequired, adminRequired, getAllOrdersAdmin);
router.get("/admin/users", accessRequired, adminRequired, getAllUsersAdmin);

// Ruta protegida para actualizar el stock manualmente desde el panel de administración
router.put("/admin/products/:id/stock", accessRequired, adminRequired, updateProductStock);

router.post("/admin/products", accessRequired, adminRequired, createProductWithMultipleImages);

export default router;