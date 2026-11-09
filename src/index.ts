import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import tasksRouter from "./routes/task.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga el .env saliendo de la carpeta dist hacia la raíz (backend)
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
const port = process.env.PORT || 4000;

// CORRECCIÓN 1: Indicar a Express que confíe en el proxy de cPanel
app.set('trust proxy', 1);

app.use(cors({
    origin: ["http://localhost:5173", "https://glamreebel.com", "https://www.glamreebel.com"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

app.use(express.json());
app.use(morgan("dev"));
app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/task", tasksRouter);

app.listen(port, () => {
    console.log(`servidor corriendo en el puerto ${port}`);
});