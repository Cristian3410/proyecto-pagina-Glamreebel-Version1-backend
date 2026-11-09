import { Router } from "express";
import { register, AccesLogin, verfify, logout } from "../controllers/auth.controllers.js";
const router = Router();
router.post("/register", register);
router.post("/login", AccesLogin);
router.get("/verifyToken", verfify);
router.get("/logout", logout);
export default router;
