/* =============================================================
 * 移动端渲染层 · 错误契约
 * -------------------------------------------------------------
 * 错误码是持久契约：措辞可以漂移，**按码分支，不要按文本分支**。
 * 错误消息统一五要素：期望签名 / 当前状态 / 候选 / 阻塞原因 / 下一步动作。
 *
 * 分类面向行动，不面向成因：
 *   transient —— 可以原地重试（网络抖动、暂不可用）
 *   permanent —— 必须换策略（鉴权失败、目标歧义、引用过期）
 * 等待循环只对 transient 重试。
 *
 * 加载方式：浏览器挂到 Mobile.errors；Node 直接 require（服务层自测要用）。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    // Node：服务层自测要真的 require 这份契约
    module.exports = factory();
  } else {
    root.Mobile = root.Mobile || {};
    root.Mobile.errors = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CODES = {
    KUMONE_NEED_LOGIN:       { kind: 'permanent', title: '需要登录' },
    KUMONE_AUTH_EXPIRED:     { kind: 'permanent', title: '登录已过期' },
    KUMONE_NETWORK:          { kind: 'transient', title: '网络不可用' },
    KUMONE_TIMEOUT:          { kind: 'transient', title: '请求超时' },
    KUMONE_DECODE_FAILED:    { kind: 'transient', title: '响应解析失败' },
    KUMONE_RATE_LIMITED:     { kind: 'transient', title: '请求过于频繁' },
    KUMONE_EMPTY_RESULT:     { kind: 'permanent', title: '没有结果' },
    KUMONE_NOT_FOUND:        { kind: 'permanent', title: '对象不存在' },
    KUMONE_BUSINESS_REJECTED: { kind: 'permanent', title: '请求被拒绝' },
    KUMONE_UNBLOCK_FAILED:   { kind: 'permanent', title: '音源解锁失败' },
    KUMONE_STALE_REF:        { kind: 'permanent', title: '引用已过期' },
    KUMONE_AMBIGUOUS_TARGET: { kind: 'permanent', title: '目标不唯一' },
    KUMONE_NO_ACTIVE_PLAYER: { kind: 'permanent', title: '没有可操作的播放' },
    KUMONE_UNSUPPORTED:      { kind: 'permanent', title: '功能未实现' }
  };

  /**
   * 构造一个契约错误。
   * @param {string} code 稳定错误码
   * @param {object} parts 五要素：expected / state / candidates / cause / next
   */
  function make(code, parts) {
    parts = parts || {};
    var meta = CODES[code] || { kind: 'permanent', title: '未知错误' };
    var message = compose(meta.title, parts);
    return {
      ok: false,
      code: code,
      kind: meta.kind,          // transient | permanent
      title: meta.title,
      message: message,
      expected: parts.expected || null,
      state: parts.state || null,
      candidates: parts.candidates || null,
      cause: parts.cause || null,
      next: parts.next || null
    };
  }

  /* 五要素拼装：缺省的部分不出现，不制造噪音 */
  function compose(title, p) {
    var lines = [title];
    if (p.expected) lines.push('Expected: ' + p.expected);
    if (p.state) lines.push('State: ' + p.state);
    if (p.candidates && p.candidates.length) {
      lines.push('Candidates: ' + p.candidates.slice(0, 3).join(' | '));
    }
    if (p.cause) lines.push('Blocked by: ' + p.cause);
    if (p.next) lines.push('Next: ' + p.next);
    return lines.join('\n');
  }

  /**
   * 把内核层的原始错误翻译成契约错误。
   * 内核已有的语义不重复发明（needLogin / decoding / httpStatus），只做映射。
   */
  function fromKernel(err, ctx) {
    ctx = ctx || {};
    var e = err || {};
    var kind = e.kind || '';
    var status = e.httpStatus || e.status || 0;
    var what = ctx.what || 'request';

    if (kind === 'needLogin') {
      return make('KUMONE_NEED_LOGIN', {
        expected: 'await invoke("' + what + '")',
        state: '账号未登录或 MUSIC_U 已失效',
        cause: e.message || '服务端返回 301',
        next: '扫码登录后重试：Mobile.act("@login", "click")'
      });
    }
    if (kind === 'decoding') {
      return make('KUMONE_DECODE_FAILED', {
        expected: 'await invoke("' + what + '")',
        state: '响应不是合法 JSON',
        cause: e.message || 'decode failed',
        next: '重试一次；持续失败说明接口返回结构变了'
      });
    }
    if (kind === 'business') {
      return make('KUMONE_BUSINESS_REJECTED', {
        expected: 'await invoke("' + what + '")',
        state: '服务端明确拒绝了这个请求' + (e.code ? '（业务码 ' + e.code + '）' : ''),
        cause: e.message || 'business error',
        next: '不要重试：换一个请求参数或换一个数据入口'
      });
    }
    if (status === 401 || status === 403) {
      return make('KUMONE_AUTH_EXPIRED', {
        expected: 'await invoke("' + what + '")',
        state: '服务端拒绝了当前凭据（HTTP ' + status + '）',
        cause: e.message || 'HTTP ' + status,
        next: '扫码登录后重试'
      });
    }
    if (status === 429) {
      return make('KUMONE_RATE_LIMITED', {
        expected: 'await invoke("' + what + '")',
        state: '触发服务端限流（HTTP 429）',
        cause: e.message || 'HTTP 429',
        next: '等待数秒后重试，不要连续请求'
      });
    }
    if (kind === 'timeout' || e.name === 'AbortError' || /timeout|超时/i.test(e.message || '')) {
      return make('KUMONE_TIMEOUT', {
        expected: 'await invoke("' + what + '")',
        state: '请求未在 15 秒内返回',
        cause: e.message || 'timeout',
        next: '重试一次；持续超时检查网络'
      });
    }
    if (status || /网络|network|fetch/i.test(e.message || '')) {
      return make('KUMONE_NETWORK', {
        expected: 'await invoke("' + what + '")',
        state: '请求未到达服务端' + (status ? '（HTTP ' + status + '）' : ''),
        cause: e.message || 'network error',
        next: '重试；连续失败说明本机网络不可用'
      });
    }
    return make('KUMONE_NETWORK', {
      expected: 'await invoke("' + what + '")',
      state: '未知失败',
      cause: e.message || String(e),
      next: '重试一次；持续失败请记录这条消息'
    });
  }

  /** 判断一个错误是否值得原地重试 */
  function retryable(err) {
    return !!(err && err.kind === 'transient');
  }

  return {
    CODES: CODES,
    make: make,
    fromKernel: fromKernel,
    retryable: retryable,
    /** 供文档与自测引用的错误码清单 */
    codes: function () { return Object.keys(CODES); }
  };
});