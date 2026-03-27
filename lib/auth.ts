import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/mongodb'
import User from '@/models/User'
import MfaLoginToken from '@/models/MfaLoginToken'
import AppSetting from '@/models/AppSetting'
import { shouldRequireMfa } from '@/lib/mfa'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaLoginToken: { label: 'MFA Login Token', type: 'text' },
      },
      async authorize(credentials) {
        await connectDB()

        if (credentials?.mfaLoginToken) {
          const loginToken = await MfaLoginToken.findOneAndUpdate(
            { token: credentials.mfaLoginToken, used: false, expiresAt: { $gt: new Date() } },
            { $set: { used: true } },
            { new: true }
          )
          if (!loginToken) return null

          const user = await User.findById(loginToken.userId)
          if (!user) return null

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
          }
        }

        if (!credentials?.email || !credentials?.password) return null

        const user = await User.findOne({ email: credentials.email.toLowerCase() })
        if (!user) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        if (shouldRequireMfa(user)) return null

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role as 'admin' | 'user'
        token.issuedAt = Math.floor(Date.now() / 1000)
      }
      // Allow client-side session.update() to refresh name/email in the token
      if (trigger === 'update' && session) {
        if (session.name) token.name = session.name
        if (session.email) token.email = session.email
      }
      // Check global logout — expire sessions issued before the globalLogoutAt timestamp
      if (token.issuedAt) {
        await connectDB()
        const setting = await AppSetting.findOne({ key: 'global' }).lean()
        const globalLogoutAt = setting?.globalLogoutAt
        if (globalLogoutAt && (token.issuedAt as number) * 1000 < new Date(globalLogoutAt).getTime()) {
          // Force expiry — returning a past exp causes next-auth to treat session as expired
          return { ...token, exp: Math.floor(Date.now() / 1000) - 1 }
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'admin' | 'user'
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,  // 8 hours
    updateAge: 5 * 60,   // revalidate every 5 minutes (enables fast global logout)
  },
}
