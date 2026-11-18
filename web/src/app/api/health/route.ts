import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    backend: 'Next.js',
    timestamp: new Date().toISOString(),
  });
}
