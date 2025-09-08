import { Router } from "express";
import { listUsers, addUser } from "../controllers/userController";

const router = Router();

// List all users
router.get("/listUsers", listUsers);

// Add new user
router.post("/addUser", addUser);

export default router;