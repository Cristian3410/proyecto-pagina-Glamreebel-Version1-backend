import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT, SMTP_SECURE, FRONTEND_URL } from "../config/config.js";
dotenv.config();
// Misma cuenta y contrase帽a que usa taskcontrollers.js (definidas en config/config.js)
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
// 馃挕 Agregamos `: string` a los par谩metros
export async function enviarEmailVerificacion(direccion, token) {
    return await transporter.sendMail({
        from: `"Glam Reebel" <${SMTP_USER}>`,
        to: direccion,
        subject: "Verificacion de cuenta nueva - Glam Reebel",
        html: createMailVerificacion(token)
    });
}
// 馃挕 Agregamos `: string` al par谩metro token
function createMailVerificacion(token) {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Verificaci贸n de Cuenta - Glam Reebel</title>
    </head>
    <body style="background-color: #ffffff; font-family: Arial, sans-serif; margin: 0; padding: 40px 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #fed6d7; padding: 40px; border-radius: 8px; border: 2px solid #ff1867;">
            
            <h1 style="color: #ff1867; font-size: 24px; margin-top: 0;">Verificaci贸n de correo electr贸nico</h1>
            
            <p style="color: #333333; font-size: 16px; line-height: 1.5;">
                Se ha creado una cuenta en la p谩gina <strong>Glam Reebel</strong> con este correo electr贸nico.
            </p>
            
            <p style="color: #333333; font-size: 16px; line-height: 1.5;">
                Si esta cuenta no fue creada por usted, puede omitir este mensaje.
            </p>
            
            <p style="color: #333333; font-size: 16px; line-height: 1.5;">
                Si usted cre贸 la cuenta, por favor haga clic en el siguiente bot贸n para verificarla:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${FRONTEND_URL}/api/verificar/${token}" target="_blank" rel="noopener noreferrer" style="background-color: #ff1867; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    Verificar Cuenta
                </a>
            </div>
            
            <p style="color: #555555; font-size: 14px; margin-top: 40px; border-top: 1px solid #ff1867; padding-top: 20px;">
                <strong>Glam Reebel</strong>
            </p>
        </div>
    </body> 
    </html>
    `;
}