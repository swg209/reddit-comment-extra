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

// 随机用户代理列表 - 更新到最新版本
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0'
];

// 随机 IP 地址生成（用于 X-Forwarded-For）
const generateRandomIP = () => {
  return `${Math.floor(Math.random() * 255) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
};

// 随机延迟函数
const randomDelay = (min: number, max: number) => 
  new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// 获取随机用户代理
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// 请求频率限制 - 简单的内存缓存
const requestCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60000; // 1分钟
const MAX_REQUESTS_PER_WINDOW = 10;

// 检查请求频率
const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const key = `${ip}_${Math.floor(now / RATE_LIMIT_WINDOW)}`;
  const count = requestCache.get(key) || 0;
  
  if (count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  requestCache.set(key, count + 1);
  
  // 清理过期的缓存
  for (const [cacheKey] of requestCache) {
    const keyTime = parseInt(cacheKey.split('_')[1]) * RATE_LIMIT_WINDOW;
    if (now - keyTime > RATE_LIMIT_WINDOW * 2) {
      requestCache.delete(cacheKey);
    }
  }
  
  return true;
};

// 备用 Reddit 端点
const REDDIT_ENDPOINTS = [
  'https://www.reddit.com',
  'https://old.reddit.com',
  'https://np.reddit.com'
];

// 重试机制 - 增强版
async function fetchWithRetry(url: string, clientIP: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const endpoint of REDDIT_ENDPOINTS) {
      try {
        // 随机延迟，模拟人类行为
        const baseDelay = attempt * 1000;
        await randomDelay(baseDelay, baseDelay + 2000);
        
        // 替换域名
        const targetUrl = url.replace(/https:\/\/[^\/]+/, endpoint);
        
        const headers: Record<string, string> = {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Pragma': 'no-cache',
          'X-Forwarded-For': generateRandomIP(),
          'X-Real-IP': generateRandomIP(),
        };

        // 随机添加一些可选头部
        if (Math.random() > 0.5) {
          headers['Referer'] = 'https://www.google.com/';
        }
        
        if (Math.random() > 0.7) {
          headers['Origin'] = endpoint;
        }

        console.log(`Attempt ${attempt}, trying endpoint: ${endpoint}`);
        
        const response = await fetch(targetUrl, {
          headers,
          // 添加超时设置
          signal: AbortSignal.timeout(45000)
        });

        if (response.ok) {
          console.log(`Success with endpoint: ${endpoint}`);
          return response;
        }

        // 如果是 403 或 429，尝试下一个端点
        if (response.status === 403 || response.status === 429) {
          console.log(`${response.status} error with ${endpoint}, trying next endpoint...`);
          continue;
        }

        return response;
      } catch (error) {
        console.error(`Error with endpoint ${endpoint}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }
    
    // 如果所有端点都失败，等待更长时间再重试
    if (attempt < maxRetries) {
      console.log(`All endpoints failed for attempt ${attempt}, waiting before retry...`);
      await randomDelay(attempt * 3000, attempt * 5000);
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
  }

  try {
    // 获取客户端IP地址
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    '127.0.0.1';

    // 检查请求频率限制
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后重试' }, 
        { status: 429 }
      );
    }

    // 确保URL以.json结尾
    let jsonUrl = url;
    if (!url.endsWith('.json')) {
      jsonUrl = url.replace(/\/$/, '') + '.json';
    }

    // 使用重试机制获取数据
    const response = await fetchWithRetry(jsonUrl, clientIP);

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