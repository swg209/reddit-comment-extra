'use client';

import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface Comment {
  id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  replies?: Comment[];
}

type SortBy = 'time' | 'score';
type SortOrder = 'asc' | 'desc';

interface ExcelRow {
  '层级': number;
  '评论ID': string;
  '作者': string;
  '内容': string;
  '点赞数': number;
  '发布时间': string;
  '时间戳': number;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // 递归排序评论函数
  const sortComments = useCallback((comments: Comment[], sortBy: SortBy, sortOrder: SortOrder): Comment[] => {
    const sorted = [...comments].sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'time') {
        comparison = a.created_utc - b.created_utc;
      } else if (sortBy === 'score') {
        comparison = a.score - b.score;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // 递归排序回复
    return sorted.map(comment => ({
      ...comment,
      replies: comment.replies ? sortComments(comment.replies, sortBy, sortOrder) : []
    }));
  }, []);

  // 使用 useMemo 优化排序性能
  const sortedComments = useMemo(() => {
    return sortComments(comments, sortBy, sortOrder);
  }, [comments, sortBy, sortOrder, sortComments]);

  // 递归扁平化评论数据用于Excel导出
  const flattenComments = (comments: Comment[], depth = 0): ExcelRow[] => {
    const result: ExcelRow[] = [];
    
    comments.forEach(comment => {
      result.push({
        '层级': depth,
        '评论ID': comment.id,
        '作者': comment.author,
        '内容': comment.body.replace(/\n/g, ' '), // 移除换行符
        '点赞数': comment.score,
        '发布时间': new Date(comment.created_utc * 1000).toLocaleString('zh-CN'),
        '时间戳': comment.created_utc
      });
      
      if (comment.replies && comment.replies.length > 0) {
        result.push(...flattenComments(comment.replies, depth + 1));
      }
    });
    
    return result;
  };

  // 导出到Excel
  const exportToExcel = () => {
    if (sortedComments.length === 0) {
      alert('没有评论数据可导出');
      return;
    }

    try {
      // 扁平化评论数据
      const flatData = flattenComments(sortedComments);
      
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 创建工作表
      const ws = XLSX.utils.json_to_sheet(flatData);
      
      // 设置列宽
      const colWidths = [
        { wch: 8 },  // 层级
        { wch: 15 }, // 评论ID
        { wch: 20 }, // 作者
        { wch: 50 }, // 内容
        { wch: 10 }, // 点赞数
        { wch: 20 }, // 发布时间
        { wch: 15 }  // 时间戳
      ];
      ws['!cols'] = colWidths;
      
      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, 'Reddit评论');
      
      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Reddit评论_${timestamp}.xlsx`;
      
      // 导出文件
      XLSX.writeFile(wb, filename);
      
      alert(`成功导出 ${flatData.length} 条评论到 ${filename}`);
    } catch (error) {
      console.error('导出Excel时出错:', error);
      alert('导出失败，请重试');
    }
  };

  const extractComments = async () => {
    if (!url) {
      setError('请输入Reddit帖子URL');
      return;
    }

    setLoading(true);
    setError('');
    setComments([]);

    try {
      // 将Reddit URL转换为JSON API URL
      let jsonUrl = url;
      if (url.includes('reddit.com/r/')) {
        jsonUrl = url.replace(/\/$/, '') + '.json';
      }

      const response = await fetch(`/api/reddit?url=${encodeURIComponent(jsonUrl)}`);
      
      if (!response.ok) {
        throw new Error('获取评论失败');
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setComments(data.comments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取评论时发生错误');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN');
  };

  const renderComment = (comment: Comment, depth = 0) => (
    <div key={comment.id} className={`border-l-2 border-gray-200 pl-4 mb-4 ${depth > 0 ? 'ml-4' : ''}`}>
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-blue-600">u/{comment.author}</span>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>👍 {comment.score}</span>
            <span>{formatDate(comment.created_utc)}</span>
          </div>
        </div>
        <p className="text-gray-800 whitespace-pre-wrap">{comment.body}</p>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map(reply => renderComment(reply, depth + 1))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Reddit 评论提取器
          </h1>
          <p className="text-gray-600">
            输入Reddit帖子链接，快速提取和查看所有评论
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入Reddit帖子URL (例如: https://www.reddit.com/r/example/comments/...)"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              onClick={extractComments}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? '提取中...' : '提取评论'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* 排序控制面板 */}
        {comments.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">排序选项</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">排序依据:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="time">时间</option>
                  <option value="score">点赞数</option>
                </select>
              </div>
              
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">排序方式:</label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  <option value="desc">
                    {sortBy === 'time' ? '最新优先' : '最高优先'}
                  </option>
                  <option value="asc">
                    {sortBy === 'time' ? '最早优先' : '最低优先'}
                  </option>
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <span className="bg-blue-50 px-3 py-1 rounded-full text-sm text-gray-600">
                  {sortBy === 'time' 
                    ? (sortOrder === 'desc' ? '📅 最新优先' : '📅 最早优先')
                    : (sortOrder === 'desc' ? '👍 最高优先' : '👎 最低优先')
                  }
                </span>
                
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm flex items-center space-x-2"
                >
                  <span>📊</span>
                  <span>导出Excel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">正在提取评论...</p>
          </div>
        )}

        {sortedComments.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              评论 ({sortedComments.length})
            </h2>
            <div className="space-y-4">
              {sortedComments.map(comment => renderComment(comment))}
            </div>
          </div>
        )}

        {!loading && comments.length === 0 && url && !error && (
          <div className="text-center py-8">
            <p className="text-gray-600">未找到评论</p>
          </div>
        )}
      </div>
    </div>
  );
}
