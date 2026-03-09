import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 150,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are PathSage, a warm and encouraging academic mentor helping Nigerian university students find scholarships, navigate academics, and plan their careers. You are on a VOICE CALL right now — this is critical to your behavior. Keep every single response to 2-3 sentences maximum. Never use bullet points, numbered lists, markdown, or any formatting. Speak in natural, warm, conversational sentences as if talking on the phone. Be direct, specific, and uplifting. Address the student like a trusted older mentor would.`,
          },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq error:', err);
      return NextResponse.json({ error: 'Groq API error' }, { status: 500 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return NextResponse.json({ error: 'No reply from Groq' }, { status: 500 });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
