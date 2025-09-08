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

const DecryptKEY = Buffer.from(process.env.AES_KEY_BASE64!, "base64");

const localKey = Buffer.from(process.env.AES_KEY_BASE64!, "base64");


function encryptAes256Gcm(plaintext: string, key: Buffer) {
  const iv = crypto.randomBytes(12); // 12 bytes para GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptAes256Gcm({
  encrypted,
  iv,
  authTag,
  key,
}: {
  encrypted: string;
  iv: string;
  authTag: string;
  key: Buffer;
}): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

app.get("/internTest", async (_req: Request, res: Response) => {
  try {
    if (localKey.length !== 32) {
      return res.status(500).json({ error: "AES_KEY must be 32 bytes" });
    }

    const sample = [
      { name: "Jonas Gomes", email: "jonas@email.com", phone: "11999999999" },
      { name: "Maria Silva", email: "maria@email.com", phone: "11988888888" },
      { name: "Carlos Souza", email: "carlos@email.com", phone: "11977777777" },
      { name: "Ana Pereira", email: "ana@email.com", phone: "11966666666" },
      { name: "Luiz Oliveira", email: "luiz@email.com", phone: "11955555555" }
    ];

    // Encrypt and decrypt
    const sampleStr = JSON.stringify(sample);
    const encrypted = encryptAes256Gcm(sampleStr, localKey);
    const decrypted = JSON.parse(
      decryptAes256Gcm({
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        key: localKey,
      })
    );

    // Send each user to addUser
    const addUserResults: any[] = [];
    for (const user of decrypted) {
      // Call addUser directly with the user as req.body
      await addUser(
        { body: user } as Request,
        {
          status: (_code: number) => ({ json: (data: any) => addUserResults.push(data) }),
        } as unknown as Response
      );
    }

    return res.json({
      plaintext: sample,
      encrypted,
      decrypted,
      addUserResponse: addUserResults,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/run", async (_req: Request, res: Response) => {
  try {
    if (!ENCRYPTED_ENDPOINT) {
      return res.status(500).json({ error: "ENCRYPTED_ENDPOINT não configurado." });
    }
    if (!DecryptKEY.length) {
      return res.status(500).json({ error: "DecryptKEY não configurada no .env" });
    }

    const resp = await fetch(ENCRYPTED_ENDPOINT);
    if (!resp.ok) {
      return res.status(502).json({ error: "Erro ao buscar endpoint seguro", status: resp.status });
    }
    const payload = await resp.json();
    console.log(payload)

    const { encrypted, iv, authTag } = payload.data.encrypted;

    if (!encrypted || !iv || !authTag) {
      return res.status(400).json({ error: "Payload inválido do endpoint seguro." });
    }

    const decryptedText = decryptAes256Gcm({
      encrypted,
      iv,
      authTag,
      key: DecryptKEY,
    });

    let dataObj: Record<string, unknown>;
    try {
      dataObj = JSON.parse(decryptedText);
    } catch {
      dataObj = { raw: decryptedText };
    }

    if (!N8N_WEBHOOK_URL) {
      return res.status(500).json({ error: "N8N_WEBHOOK_URL não configurado." });
    }

    const n8nResp = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataObj),
    });

    if (!n8nResp.ok) {
      const text = await n8nResp.text();
      return res.status(502).json({ error: "Erro no N8N", status: n8nResp.status, body: text });
    }

    const n8nResult = await n8nResp.json();
    return res.json({ success: true, n8n: n8nResult });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/truncate", async (_req: Request, res: Response) => {
  try {
    if (!process.env.N8N_TRUNCATE_WEBHOOK) {
      return res
        .status(500)
        .json({ error: "N8N_TRUNCATE_WEBHOOK não configurado." });
    }

    const resp = await fetch(process.env.N8N_TRUNCATE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(502).json({
        error: "Erro no truncate",
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
