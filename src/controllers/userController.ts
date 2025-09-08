import { Request, Response } from "express";
import fetch from "node-fetch";
import { pool } from "../config/db";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export async function addUser(req: Request, res: Response) {
  try {
    const { name, email, phone } = req.body;

    if (N8N_WEBHOOK_URL) {
      await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
    } else {
      console.warn("N8N_WEBHOOK_URL is not configured.");
    }

    res.status(201).json("User added successfully");
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

export async function listUsers(req: Request, res: Response) {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
}
