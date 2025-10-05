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

// 更新的User-Agent列表，包含最新浏览器版本和移动端
const USER_AGENTS = [
  // Chrome 最新版本
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  
  // Firefox 最新版本
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  
  // Safari 最新版本
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  
  // Edge 最新版本
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  
  // 移动端 User-Agent (更难被检测)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  
  // 一些不太常见但真实的浏览器
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Vivaldi/6.5.3206.63'
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

// 备用 Reddit 端点 - 增加更多端点和代理策略
const REDDIT_ENDPOINTS = [
  'https://www.reddit.com',
  'https://old.reddit.com',
  'https://np.reddit.com',
  'https://i.reddit.com',
  'https://m.reddit.com'
];

// 生成更真实的浏览器指纹
const generateBrowserFingerprint = () => {
  const screens = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 2560, height: 1440 }
  ];
  
  const screen = screens[Math.floor(Math.random() * screens.length)];
  const languages = ['en-US', 'en-GB', 'zh-CN', 'es-ES', 'fr-FR', 'de-DE'];
  const timezones = [-480, -420, -360, -300, -240, 0, 60, 120, 480, 540];
  
  return {
    screen: `${screen.width}x${screen.height}`,
    language: languages[Math.floor(Math.random() * languages.length)],
    timezone: timezones[Math.floor(Math.random() * timezones.length)],
    platform: Math.random() > 0.5 ? 'Win32' : 'MacIntel'
  };
};

// 重试机制 - 针对Vercel环境优化
async function fetchWithRetry(url: string, clientIP: string, maxRetries = 5): Promise<Response> {
  let lastError: Error | null = null;
  const fingerprint = generateBrowserFingerprint();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 随机打乱端点顺序
    const shuffledEndpoints = [...REDDIT_ENDPOINTS].sort(() => Math.random() - 0.5);
    
    for (const endpoint of shuffledEndpoints) {
      try {
        // 更长的随机延迟，特别是在Vercel环境中
        const baseDelay = attempt * 2000 + Math.random() * 3000;
        await randomDelay(baseDelay, baseDelay + 2000);
        
        // 替换域名
        const targetUrl = url.replace(/https:\/\/[^\/]+/, endpoint);
        
        // 更完整的请求头，模拟真实浏览器
        const headers: Record<string, string> = {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': `${fingerprint.language},en;q=0.9`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': attempt === 1 ? 'none' : 'same-origin',
          'Sec-Fetch-User': '?1',
          'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': `"${fingerprint.platform}"`,
          'Cache-Control': 'max-age=0',
          'Pragma': 'no-cache',
          'X-Forwarded-For': generateRandomIP(),
          'X-Real-IP': generateRandomIP(),
        };

        // 根据尝试次数添加不同的头部策略
        if (attempt > 1) {
          headers['Referer'] = 'https://www.google.com/search?q=reddit';
        }
        
        if (attempt > 2) {
          headers['Origin'] = endpoint;
          headers['Cookie'] = `session_tracker=${Math.random().toString(36).substring(7)}; reddit_session=${Math.random().toString(36).substring(7)}`;
        }

        // 在Vercel环境中添加更多伪装
        if (process.env.VERCEL) {
          headers['CF-Connecting-IP'] = generateRandomIP();
          headers['X-Forwarded-Proto'] = 'https';
          headers['X-Vercel-IP-Country'] = ['US', 'CA', 'GB', 'DE', 'FR'][Math.floor(Math.random() * 5)];
        }

        console.log(`Attempt ${attempt}/${maxRetries}, endpoint: ${endpoint}, delay: ${Math.round(baseDelay)}ms`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 增加到60秒超时
        
        const response = await fetch(targetUrl, {
          headers,
          signal: controller.signal,
          // 添加更多fetch选项
          redirect: 'follow',
          referrerPolicy: 'strict-origin-when-cross-origin'
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`✅ Success with endpoint: ${endpoint} (${response.status})`);
          return response;
        }

        // 如果是 403 或 429，尝试下一个端点
        if (response.status === 403 || response.status === 429) {
          console.log(`⚠️  ${response.status} error with ${endpoint}, trying next endpoint...`);
          continue;
        }

        // 对于其他HTTP错误，也记录但继续尝试
        if (!response.ok) {
          console.log(`⚠️  HTTP ${response.status} error with ${endpoint}, continuing...`);
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          continue;
        }

        return response;
      } catch (error) {
        console.error(`❌ Error with endpoint ${endpoint}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 对于网络错误，立即尝试下一个端点
        continue;
      }
    }
    
    // 如果所有端点都失败，等待更长时间再重试
    if (attempt < maxRetries) {
      const waitTime = attempt * 3000 + Math.random() * 2000;
      console.log(`🔄 All endpoints failed for attempt ${attempt}/${maxRetries}, waiting ${Math.round(waitTime)}ms before retry...`);
      await randomDelay(waitTime, waitTime + 1000);
    }
  }
  
  // 所有重试都失败了
  console.error(`💥 All retry attempts failed. Last error:`, lastError);
  throw lastError || new Error('All endpoints failed after maximum retries');
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