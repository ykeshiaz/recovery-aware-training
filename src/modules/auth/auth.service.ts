import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { signAuthToken } from "../../lib/jwt";
import { HttpError } from "../../lib/httpError";

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: "client" | "trainer";
  timezone?: string;
  // Only meaningful when role === "client" -- assigns them to an existing
  // trainer at signup. Optional because a client might sign up before a
  // trainer has claimed them.
  trainerId?: string;
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  if (input.trainerId) {
    const trainer = await prisma.user.findUnique({ where: { id: input.trainerId } });
    if (!trainer || trainer.role !== "trainer") {
      throw new HttpError(400, "trainerId does not refer to a valid trainer");
    }
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      timezone: input.timezone ?? "UTC",
      trainerId: input.role === "client" ? input.trainerId : undefined,
    },
  });

  return buildAuthResult(user);
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for "no such user" and "wrong password" -- don't leak which
  // one it was, that just helps someone enumerate registered emails.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  return buildAuthResult(user);
}

function buildAuthResult(user: { id: string; email: string; name: string; role: "client" | "trainer"; timezone: string }) {
  const token = signAuthToken({ sub: user.id, role: user.role });
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, timezone: user.timezone },
  };
}
