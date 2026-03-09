import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 80,
        temperature: 0.7,
        stream: false,
        messages: [
          {
            role: 'system',
            content: `You are PathSage, a warm mentor helping Nigerian university students with scholarships and careers. You are on a VOICE CALL. Rules: Max 2 short sentences. No bullet points, no markdown, no lists. Natural spoken words only. Be warm and direct.`,
          },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq chat error:', err);
      return NextResponse.json({ error: 'Groq API error', detail: err }, { status: 500 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return NextResponse.json({ error: 'No reply from Groq' }, { status: 500 });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
