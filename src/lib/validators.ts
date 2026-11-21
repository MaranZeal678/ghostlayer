import { z } from "zod";

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  websiteUrl: z.string().trim().url().max(500),
  authorized: z.literal(true, { message: "You must confirm you are authorized to test this website" }),
  connectionId: z.string().optional().nullable(),
  repositoryId: z.coerce.number().int().positive().optional().nullable(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  websiteUrl: z.string().trim().url().max(500).optional(),
  maxActions: z.coerce.number().int().min(5).max(100).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  connectionId: z.string().optional().nullable(),
  repositoryId: z.coerce.number().int().positive().optional().nullable(),
  disconnectRepository: z.boolean().optional(),
});
