import { Request, Response } from "express";
import { pool } from "../db/database.js";
import { checkQuery, insertNewQuery, findUser, checkEmailExistsQuery } from "../queries/queries.js";
import jwt from "jsonwebtoken";
import { enviarEmailVerificacion } from "../services/email.services.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();
const CLAVE_SECRETA = process.env.JWT_SECRET || "tu_clave_secreta_por_defecto";


interface TokenPayload {
    id: number | string;
    name: string;
    email: string;
}

export const register = async (req: Request, res: Response) => {
    try {
        const { correo, usuario, contraseña } = req.body;
        console.log(req.body);
        
        if (!correo || !usuario || !contraseña) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        const result = await pool.query(checkQuery, [usuario, correo]);

        if (result.rows.length > 0) {
            const existingRecord = result.rows[0];
            if (existingRecord.name === usuario) {
                console.log("El usuario ya se encuentra registrado");
                return res.status(400).json(["El usuario ya se encuentra registrado"]);
            }
            if (existingRecord.email === correo) {
                console.log("El correo ya se encuentra registrado");
                return res.status(400).json(["el correo electronico ya se encuentra registrado"]);
            }
        }

        const tokenVerificacion = jwt.sign(
            { email: correo },
            CLAVE_SECRETA as string,
            { expiresIn: "1h" }
        );

        const mailRegister = await enviarEmailVerificacion(correo, tokenVerificacion);

        console.log(mailRegister);
        if (mailRegister.accepted.length === 0) {
            return res.status(500).json({ error: "error enviando email de verificacion" });
        }

        const salt = await bcrypt.genSalt(5);
        const hashPassword = await bcrypt.hash(contraseña, salt);
        const resultInsert = await pool.query(insertNewQuery, [usuario, correo, hashPassword]);
        const nuevoUsuario = resultInsert.rows[0];

        const tokenSesion = jwt.sign(
            { 
                id: nuevoUsuario.id, 
                name: nuevoUsuario.name,
                email: nuevoUsuario.email 
            },
            CLAVE_SECRETA as string,
            { expiresIn: "7d" }
        );

        res.cookie("token", tokenSesion, {
            httpOnly: true,
            secure: false, 
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.status(201).json({
            status: "ok",
            message: "Usuario registrado con éxito",
            token: tokenSesion,
            user: {
                id: nuevoUsuario.id,
                nombre: nuevoUsuario.name,
                correo: nuevoUsuario.email
            }
        });
    
    } catch (error) {
        console.error("error en el registro", error);
        return res.status(500).json({ error: "Error interno del servidor al procesar el registro" });
    }
};

export const AccesLogin = async (req: Request, res: Response) => {
    const { identificador, contraseña } = req.body;
    if (!identificador || !contraseña) {
        return res.status(400).json(["los campos estan vacios"]);
    }
    try {
        const result = await pool.query(findUser, [identificador, identificador]);

        if (result.rows.length === 0) {
            return res.status(400).json(["Usuario o password incorrecto"]);
        }

        const usuarioResult = result.rows[0];

        const esPasswordCorrecta = await bcrypt.compare(contraseña, usuarioResult.password_hash);

        if (!esPasswordCorrecta) {
            return res.status(400).json(["Usuario o password incorrecto"]);
        }

        const payload: TokenPayload = {
            id: usuarioResult.id,
            name: usuarioResult.name,
            email: usuarioResult.email,
        };

        const token = jwt.sign(
            payload,
            CLAVE_SECRETA as string,
            { expiresIn: "1d" }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: false, 
            sameSite: "lax", 
            maxAge: 24 * 60 * 60 * 1000 
        });

        return res.status(200).send({
            status: "ok",
            message: "Logeado con exito",
            token,
            user: {
                nombre: usuarioResult.name,
                correo: usuarioResult.email,
                id: usuarioResult.id
            }
        });
        
    } catch (error) {
        console.log(error, "ocurrio un error en el sistema");
        return res.status(500).json(["Error interno del servidor"]);
    }
};

export const logout = async (req: Request, res: Response) => {
    res.cookie("token", "", {
        httpOnly: true,
        secure: false,
        expires: new Date(0),
        sameSite: "lax",
    });
    return res.status(200).json({ message: "token eliminado con éxito" });
};

export const verfify = async (req: Request, res: Response) => {
    const { token } = req.cookies;
    
    if (!token) return res.status(401).json(["no autorizado"]);

    jwt.verify(token, CLAVE_SECRETA as string, async (err: any, decoded: any) => {
        if (err) return res.status(401).json(["no autorizado"]);

        try {
            const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [decoded.id]);

            if (result.rows.length === 0) {
                return res.status(401).json(["no autorizado"]);
            }

            const usuarioEncontrado = result.rows[0];

            return res.status(200).json({
                id: usuarioEncontrado.id,
                nombre: usuarioEncontrado.name,
                correo: usuarioEncontrado.email
            });

        } catch (dbError) {
            console.log(dbError, "error al verificar el token en la BD");
            return res.status(500).json(["Error interno del servidor"]);
        }
    });
};

export const profile = async (req: Request, res: Response) => {
    res.send("profile");
};