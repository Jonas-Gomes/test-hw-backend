import { Request, Response } from "express";
import fetch from "node-fetch";
import { pool } from "../config/db";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

export async function addUser(req: Request, res: Response) {
  try {
    const users = req.body;

    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: "Nenhum usuário fornecido" });
    }

    if (!N8N_WEBHOOK_URL) {
      console.warn("N8N_WEBHOOK_URL is not configured.");
      return res.status(500).json({ error: "N8N_WEBHOOK_URL not configured" });
    }

    // Dispara todas as requisições em paralelo
    const results = await Promise.all(
      users.map(async (user) => {
        const { nome: name, email, telefone: phone } = user;

        try {
          const n8nResp = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome: name, email, telefone: phone }),
          });

          if (!n8nResp.ok) {
            const text = await n8nResp.text();
            return {
              user: name,
              email,
              phone,
              success: false,
              error: text,
              status: n8nResp.status,
            };
          }

          const n8nResult = await n8nResp.json();
          return {
            user: name,
            email,
            phone,
            success: true,
            fromN8N: n8nResult,
          };
        } catch (err: any) {
          return {
            user: name,
            email,
            phone,
            success: false,
            error: err.message,
          };
        }
      })
    );

    return res.status(201).json({ results });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
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
