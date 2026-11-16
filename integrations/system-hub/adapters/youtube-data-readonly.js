const DATA_API_BASE = "https://youtube.googleapis.com/youtube/v3/";
const ANALYTICS_API_BASE = "https://youtubeanalytics.googleapis.com/v2/reports";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
const PAGE_TOKEN = /^[A-Za-z0-9_=-]{1,2048}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_METRICS = new Set([
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares"
]);
const ANALYTICS_DIMENSIONS = new Set([
  "day",
  "video",
  "country",
  "deviceType",
  "trafficSourceType"
]);

function requiredAccessToken(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > 8192 || /\s/.test(value)) {
    throw new TypeError("valid_server_access_token_required");
  }
  return value;
}
function boundedInteger(value, fallback, min, max, code) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new TypeError(code);
  return number;
}
function safeDate(value, field) {
  if (typeof value !== "string" || !DATE.test(value)) throw new TypeError("invalid_" + field);
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError("invalid_" + field);
  }
  return value;
}
function parseCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function parseDateRange(startDate, endDate) {
  const start = safeDate(startDate, "start_date");
  const end = safeDate(endDate, "end_date");
  if (start > end) throw new TypeError("start_date_after_end_date");
  return { startDate: start, endDate: end };
}
function providerError(status) {
  if (status === 401) return "google_access_token_rejected";
  if (status === 403) return "google_api_access_denied_or_quota_exceeded";
  if (status === 404) return "youtube_resource_not_found";
  if (status === 429) return "google_api_rate_limited";
  if (status >= 500) return "google_api_unavailable";
  return "google_api_request_rejected";
}
async function requestJson(url, accessToken, fetchImpl = fetch) {
  requiredAccessToken(accessToken);
  if (!(url instanceof URL) || url.protocol !== "https:" ||
      !["youtube.googleapis.com", "youtubeanalytics.googleapis.com"].includes(url.hostname)) {
    throw new TypeError("unapproved_google_api_endpoint");
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + accessToken
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error("google_api_unavailable");
  }
  if (!response.ok) throw new Error(providerError(response.status));
  try {
    return await response.json();
  } catch {
    throw new Error("google_api_invalid_response");
  }
}
function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}
function assertItems(payload, maxItems) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length > maxItems) {
    throw new Error("google_api_invalid_response");
  }
  return payload.items;
}

export const youtubeDataReadonly = Object.freeze({
  providerId: "youtube",
  mode: "read-only",
  capabilities: Object.freeze([
    "youtube.channel.read",
    "youtube.videos.read",
    "youtube.video_stats.read",
    "youtube.analytics.read"
  ]),

  async getChannel({ accessToken, fetchImpl } = {}) {
    const payload = await requestJson(apiUrl(DATA_API_BASE + "channels", {
      part: "snippet,contentDetails,statistics",
      mine: "true"
    }), accessToken, fetchImpl);
    const items = assertItems(payload, 1);
    if (items.length !== 1) throw new Error("youtube_channel_not_found");
    const item = items[0];
    if (typeof item.id !== "string" || typeof item.snippet?.title !== "string") {
      throw new Error("google_api_invalid_response");
    }
    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
    return {
      channelId: item.id,
      title: item.snippet.title,
      description: typeof item.snippet.description === "string" ? item.snippet.description : "",
      customUrl: typeof item.snippet.customUrl === "string" ? item.snippet.customUrl : null,
      publishedAt: typeof item.snippet.publishedAt === "string" ? item.snippet.publishedAt : null,
      uploadsPlaylistId: typeof uploadsPlaylistId === "string" ? uploadsPlaylistId : null,
      statistics: {
        viewCount: parseCount(item.statistics?.viewCount),
        subscriberCount: parseCount(item.statistics?.subscriberCount),
        videoCount: parseCount(item.statistics?.videoCount),
        hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount === true
      },
      source: "youtube.data.channels.list",
      mode: "read-only",
      ordersEnabled: false,
      executionEnabled: false,
      liveTradingEnabled: false
    };
  },

  async listVideos({ accessToken, playlistId, pageToken, maxResults = 25, fetchImpl } = {}) {
    if (typeof playlistId !== "string" || !PLAYLIST_ID.test(playlistId)) {
      throw new TypeError("invalid_uploads_playlist_id");
    }
    if (pageToken !== undefined && (typeof pageToken !== "string" || !PAGE_TOKEN.test(pageToken))) {
      throw new TypeError("invalid_page_token");
    }
    const limit = boundedInteger(maxResults, 25, 1, 50, "max_results_out_of_range");
    const payload = await requestJson(apiUrl(DATA_API_BASE + "playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: limit,
      pageToken
    }), accessToken, fetchImpl);
    const items = assertItems(payload, limit);
    const videos = items.map((item) => {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (typeof videoId !== "string" || !VIDEO_ID.test(videoId) ||
          typeof item.snippet?.title !== "string") throw new Error("google_api_invalid_response");
      return {
        videoId,
        title: item.snippet.title,
        description: typeof item.snippet.description === "string" ? item.snippet.description : "",
        publishedAt: typeof item.contentDetails?.videoPublishedAt === "string"
          ? item.contentDetails.videoPublishedAt
          : (typeof item.snippet.publishedAt === "string" ? item.snippet.publishedAt : null),
        thumbnailUrl: typeof item.snippet?.thumbnails?.medium?.url === "string"
          ? item.snippet.thumbnails.medium.url : null
      };
    });
    return {
      videos,
      nextPageToken: typeof payload.nextPageToken === "string" ? payload.nextPageToken : null,
      resultCount: videos.length,
      source: "youtube.data.playlistItems.list",
      mode: "read-only"
    };
  },

  async getVideoStats({ accessToken, videoIds, fetchImpl } = {}) {
    if (!Array.isArray(videoIds) || videoIds.length < 1 || videoIds.length > 50 ||
        videoIds.some((id) => typeof id !== "string" || !VIDEO_ID.test(id)) ||
        new Set(videoIds).size !== videoIds.length) {
      throw new TypeError("video_ids_must_be_1_to_50_unique_ids");
    }
    const payload = await requestJson(apiUrl(DATA_API_BASE + "videos", {
      part: "snippet,contentDetails,statistics",
      id: videoIds.join(",")
    }), accessToken, fetchImpl);
    const items = assertItems(payload, 50);
    return {
      videos: items.map((item) => {
        if (typeof item.id !== "string" || !VIDEO_ID.test(item.id)) throw new Error("google_api_invalid_response");
        return {
          videoId: item.id,
          title: typeof item.snippet?.title === "string" ? item.snippet.title : "",
          publishedAt: typeof item.snippet?.publishedAt === "string" ? item.snippet.publishedAt : null,
          duration: typeof item.contentDetails?.duration === "string" ? item.contentDetails.duration : null,
          viewCount: parseCount(item.statistics?.viewCount),
          likeCount: parseCount(item.statistics?.likeCount),
          commentCount: parseCount(item.statistics?.commentCount)
        };
      }),
      source: "youtube.data.videos.list",
      mode: "read-only"
    };
  },

  async getAnalytics({ accessToken, startDate, endDate, metrics, dimensions, fetchImpl } = {}) {
    const range = parseDateRange(startDate, endDate);
    if (typeof metrics !== "string" || !metrics.trim() ||
        metrics.split(",").some((metric) => !ANALYTICS_METRICS.has(metric))) {
      throw new TypeError("unsupported_analytics_metrics");
    }
    if (dimensions !== undefined && (typeof dimensions !== "string" ||
        dimensions.split(",").some((dimension) => !ANALYTICS_DIMENSIONS.has(dimension)))) {
      throw new TypeError("unsupported_analytics_dimensions");
    }
    const payload = await requestJson(apiUrl(ANALYTICS_API_BASE, {
      ids: "channel==MINE",
      startDate: range.startDate,
      endDate: range.endDate,
      metrics,
      dimensions
    }), accessToken, fetchImpl);
    if (!payload || !Array.isArray(payload.columnHeaders) ||
        !Array.isArray(payload.rows || []) ||
        payload.rows.length > 10000 ||
        payload.rows.some((row) => !Array.isArray(row) || row.length !== payload.columnHeaders.length)) {
      throw new Error("google_api_invalid_response");
    }
    return {
      columnHeaders: payload.columnHeaders,
      rows: payload.rows || [],
      rowCount: (payload.rows || []).length,
      startDate: range.startDate,
      endDate: range.endDate,
      source: "youtube.analytics.reports.query",
      mode: "read-only"
    };
  }
});
