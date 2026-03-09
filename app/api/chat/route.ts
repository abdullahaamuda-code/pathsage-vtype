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
        model: 'moonshotai/kimi-k2-instruct-0905',
        max_tokens: 120,
        temperature: 0.6,
        top_p: 1,
        stream: false,
        messages: [
          {
            role: 'system',
            content: `You are PathSage, a warm and encouraging mentor helping Nigerian university students find scholarships, navigate academics, and plan careers. You are on a VOICE CALL. Critical rules: Keep responses to 2 sentences maximum. Never use bullet points, lists, markdown, or any formatting. Speak in natural conversational sentences like you are on the phone. Be warm, direct, and encouraging like a trusted older sibling.`,
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
