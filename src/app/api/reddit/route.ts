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

// 随机用户代理列表
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

// 随机延迟函数
const randomDelay = (min: number, max: number) => 
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// 获取随机用户代理
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// 重试机制
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 随机延迟 1-3 秒
      await randomDelay(1000, 3000);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.reddit.com/',
        },
        // 添加超时设置
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        return response;
      }

      // 如果是 403 或 429，等待更长时间再重试
      if (response.status === 403 || response.status === 429) {
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed with ${response.status}, retrying in ${attempt * 2} seconds...`);
          await randomDelay(attempt * 2000, attempt * 4000);
          continue;
        }
      }

      return response;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      // 指数退避
      await randomDelay(attempt * 1000, attempt * 2000);
    }
  }
  
  throw new Error('Max retries exceeded');
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

    // 使用重试机制获取数据
    const response = await fetchWithRetry(jsonUrl);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`Reddit API error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 403) {
        throw new Error(`访问被拒绝 (403): Reddit可能检测到了自动化请求。请稍后重试或使用不同的URL。`);
      } else if (response.status === 429) {
        throw new Error(`请求过于频繁 (429): 请稍后重试。`);
      } else {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
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