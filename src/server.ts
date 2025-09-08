import express, { Request, Response } from "express";
import crypto from "crypto";
import dotenv from "dotenv";
import fetch from "node-fetch";
import userRoutes from "./routes/userRoutes";
import { addUser } from "./controllers/userController";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use("/users", userRoutes);

const {
  ENCRYPTED_ENDPOINT,
  N8N_WEBHOOK_URL,
  N8N_TRUNCATE_WEBHOOK,
  PORT = 4000,
} = process.env;

function decryptAes256Gcm({ encrypted, iv, authTag, key }: {
  encrypted: string;
  iv: string;
  authTag: string;
  key: string;
}): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"), 
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

app.post("/decrypt", async (_req: Request, res: Response) => {
  try {
    if (!ENCRYPTED_ENDPOINT) {
      return res.status(500).json({ error: "ENCRYPTED_ENDPOINT is not configured" });
    }

    const resp = await fetch(ENCRYPTED_ENDPOINT);
    if (!resp.ok) {
      return res.status(502).json({ error: "Error fetching secure endpoint", status: resp.status });
    }
    const payload = await resp.json();

    const { encrypted, iv, authTag } = payload.data.encrypted;
    const secretKey = payload.data.secretKey;

    if (!encrypted || !iv || !authTag || !secretKey) {
      return res.status(400).json({ error: "Invalid payload from secure endpoint" });
    }

    const decryptedText = decryptAes256Gcm({
      encrypted,
      iv,
      authTag,
      key: secretKey,
    });

    const dataObj = JSON.parse(decryptedText);

    let addUserResult: any;
    const fakeRes = {
      status: (_code: number) => ({
        json: (data: any) => {
          addUserResult = data;
          return data;
        },
      }),
    } as unknown as Response;

    await addUser({ body: dataObj } as Request, fakeRes);

    return res.json({
      plaintext: dataObj,
      addUserResponse: addUserResult,
    });
  } catch (err: any) {
    console.error("Error in /decrypt:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/truncate", async (_req: Request, res: Response) => {
  try {
    if (!process.env.N8N_TRUNCATE_WEBHOOK) {
      return res
        .status(500)
        .json({ error: "N8N_TRUNCATE_WEBHOOK is not configured." });
    }

    const resp = await fetch(process.env.N8N_TRUNCATE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(502).json({
        error: "Error on truncate",
        status: resp.status,
        body: txt,
      });
    }

    const body = await resp.json().catch(() => ({}));
    return res.json({ success: true, result: body });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Backend port:${PORT}`));
