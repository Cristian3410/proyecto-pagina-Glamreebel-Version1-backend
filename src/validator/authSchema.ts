import { z } from "zod";
export const registerSchema = z.object({
    usuario: z.string()
        .min(5, "El nombre de usuario debe tener al menos 5 caracteres")
        .max(15, "El nombre de usuario no puede superar los 15 caracteres"),
    correo: z.string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "El formato del correo electrónico no es válido"),
    contraseña: z.string()
        .min(7, "La contraseña debe tener al menos 7 caracteres")
        .max(15, "La contraseña no puede superar los 15 caracteres")
        .regex(/[A-Z]/, "la contraseña debe contener al menos una letra mayuscula")
        .regex(/[0-9]/, "la contraseña debe contener almenos un numero")
});
export const checkoutRegisterSchema = z.object({
    nombre: z.string()
        .min(2, "El nombre debe tener al menos 2 caracteres"),
    apellido: z.string()
        .min(2, "El apellido debe tener al menos 2 caracteres"),
    cedula: z.string()
        .min(6, "La cédula debe tener al menos 6 dígitos")
        .max(10, "La cédula no puede superar los 10 dígitos"),
    telefono: z.string()
        .regex(/^3[0-9]{9}$/, "El número de celular debe ser válido en Colombia (debe empezar por 3 y tener 10 dígitos)"),
    email: z.string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "El formato del correo electrónico no es válido"),
    password: z.string()
        .min(7, "La contraseña debe tener al menos 7 caracteres")
        .max(15, "La contraseña no puede superar los 15 caracteres")
        .regex(/[A-Z]/, "La contraseña debe contener al menos una letra mayúscula")
        .regex(/[a-z]/, "La contraseña debe contener al menos una letra minúscula")
        .regex(/[0-9]/, "La contraseña debe contener al menos un número")
        .regex(/^\S*$/, "La contraseña no puede contener espacios en blanco")
});