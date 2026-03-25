import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'

// One-time setup endpoint to create the initial admin user
// Only works when no users exist in the database
export async function POST(req: Request) {
  await connectDB()

  const count = await User.countDocuments()
  if (count > 0) {
    return NextResponse.json(
      { error: 'Setup already completed. An admin user already exists.' },
      { status: 400 }
    )
  }

  const body = await req.json()
  const { name, email, password } = body

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'name, email, and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await User.create({ name, email, role: 'admin', passwordHash })

  return NextResponse.json({ success: true, email: user.email }, { status: 201 })
}

// GET: check if setup is needed
export async function GET() {
  await connectDB()
  const count = await User.countDocuments()
  return NextResponse.json({ setupRequired: count === 0 })
}
