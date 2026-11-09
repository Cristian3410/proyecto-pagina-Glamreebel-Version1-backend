import { ZodError } from "zod";
export const validatingSchema = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            return next();
        }
        catch (error) {
            if (error instanceof ZodError) {
                console.error("Errores de validaci贸n capturados:", JSON.stringify(error.issues, null, 2));
                return res.status(400).json({
                    status: "Error",
                    message: "Datos de entrada inv谩lidos",
                    detalles: error.issues.map((err) => err.message)
                });
            }
            console.error("error desconocido", error);
            return res.status(500).json({
                status: "Error",
                message: "Error interno del servidor en la validaci贸n"
            });
        }
    };
};
