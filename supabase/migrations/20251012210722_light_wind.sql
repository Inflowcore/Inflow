/*
  # Fix infinite recursion in users table RLS policies

  1. Changes
    - Drop all existing RLS policies on users table to prevent conflicts
    - Create new, safe RLS policies that don't cause infinite recursion
    - Ensure policies use auth.uid() = id pattern without self-referencing queries

  2. Security
    - Enable RLS on users table
    - Add policies for authenticated users to manage their own data only
    - Prevent infinite recursion by using simple auth.uid() comparisons

  3. Notes
    - This fixes the "infinite recursion detected in policy" error
    - Policies are designed to be safe and performant
*/

-- Drop all existing policies on users table to start fresh
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can delete own data" ON users;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON users;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON users;

-- Ensure RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create safe RLS policies that don't cause infinite recursion
CREATE POLICY "users_select_own"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_insert_own"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_delete_own"
  ON users
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);