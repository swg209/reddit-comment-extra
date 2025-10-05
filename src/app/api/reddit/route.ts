import { NextRequest, NextResponse } from 'next/server';

interface RedditComment {
  kind: string;
  data: {
    id: string;
    author: string;
    body: string;
    score: number;
    created_utc: number;
    replies?: {
      data: {
        children: RedditComment[];
      };
    };
  };
}

interface ParsedComment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  replies: ParsedComment[];
}

interface RedditPost {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: RedditComment['data'];
    }>;
  };
}

function parseComments(comments: RedditComment[]): ParsedComment[] {
  return comments
    .filter(comment => comment.kind === 't1' && comment.data.body !== '[deleted]')
    .map(comment => ({
      id: comment.data.id,
      author: comment.data.author,
      body: comment.data.body,
      score: comment.data.score,
      created_utc: comment.data.created_utc,
      replies: comment.data.replies 
        ? parseComments(comment.data.replies.data.children)
        : []
    }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
  }

  try {
    // 确保URL以.json结尾
    let jsonUrl = url;
    if (!url.endsWith('.json')) {
      jsonUrl = url.replace(/\/$/, '') + '.json';
    }

    // 添加用户代理头以避免被Reddit阻止
    const response = await fetch(jsonUrl, {
      headers: {
        'User-Agent': 'Reddit Comment Extractor 1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RedditPost[] = await response.json();
    
    if (!Array.isArray(data) || data.length < 2) {
      throw new Error('无效的Reddit数据格式');
    }

    // 第二个元素包含评论数据
    const commentsData = data[1];
    
    if (!commentsData.data || !commentsData.data.children) {
      return NextResponse.json({ comments: [] });
    }

    const comments = parseComments(commentsData.data.children);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('获取Reddit数据时出错:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取Reddit数据失败' },
      { status: 500 }
    );
  }
}