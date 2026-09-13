import { Router } from "express";
import { z } from "zod";
import { registerUser, loginUser } from "./auth.service";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  role: z.enum(["client", "trainer"]),
  timezone: z.string().optional(),
  trainerId: z.string().optional(),
});

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await registerUser(input);
  res.status(201).json(result);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const result = await loginUser(email, password);
  res.status(200).json(result);
});
