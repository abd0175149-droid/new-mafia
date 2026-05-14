-- Migration: Add assigned_activity_id to tickets
-- This allows pre-assigning tickets to specific activities

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_activity_id INTEGER;
