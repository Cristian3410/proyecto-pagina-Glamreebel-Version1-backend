import jwt from "jsonwebtoken";
import "dotenv/config";

const TOKEN_SECRET = process.env.JWT_SECRET;
if (!TOKEN_SECRET) throw new Error("Falta configurar JWT_SECRET en el entorno");

export const accessRequired = (req, res, next) => {
    const { token } = req.cookies;
    if (!token) {
        return res.status(401).json(["No hay token registrado, no autorizado"]);
    }
    
    jwt.verify(token, TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json(["no autorizado"]);
        }
        req.user = user;
        next();
    });
};

// •0‹4 Nuevo middleware para proteger las rutas exclusivas del administrador
export const adminRequired = (req, res, next) => {
    // Como accessRequired se ejecuta primero, req.user ya contiene los datos del token (incluyendo el role)
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json(["Acceso denegado. Se requieren permisos de administrador."]);
    }
};
