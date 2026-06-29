-- Manuální expirace aktivního členství (admin nastaví datum konce platnosti).
ALTER TABLE "User" ADD COLUMN "membershipExpiresAt" TIMESTAMP(3);
