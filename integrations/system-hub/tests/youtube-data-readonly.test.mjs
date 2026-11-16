import test from "node:test";
import assert from "node:assert/strict";
import { youtubeDataReadonly } from "../adapters/youtube-data-readonly.js";

const TOKEN = "server-side-google-access-token-test";
const VIDEO_ID = "abcdefghijk";
function fakeFetch(payload, status = 200, inspect = () => {}) {
  return async (url, init) => {
    inspect(new URL(url), init);
    return Response.json(payload, { status });
  };
}
const channelPayload = {
  items: [{
    id: "UC1234567890123456789012",
    snippet: {
      title: "Example Channel",
      description: "Read-only test channel",
      customUrl: "@example",
      publishedAt: "2020-01-01T00:00:00Z"
    },
    contentDetails: { relatedPlaylists: { uploads: "UU12345678901234567890" } },
    statistics: { viewCount: "1000", subscriberCount: "250", videoCount: "12", hiddenSubscriberCount: false }
  }]
};

test("channel uses fixed YouTube API host, GET only, and bearer auth", async () => {
  const result = await youtubeDataReadonly.getChannel({
    accessToken: TOKEN,
    fetchImpl: fakeFetch(channelPayload, 200, (url, init) => {
      assert.equal(url.origin, "https://youtube.googleapis.com");
      assert.equal(url.pathname, "/youtube/v3/channels");
      assert.equal(url.searchParams.get("mine"), "true");
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, "Bearer " + TOKEN);
      assert.equal(init.body, undefined);
    })
  });
  assert.equal(result.channelId, "UC1234567890123456789012");
  assert.equal(result.statistics.subscriberCount, 250);
  assert.equal(result.uploadsPlaylistId, "UU12345678901234567890");
  assert.equal(result.liveTradingEnabled, false);
});

test("video listing is bounded and uses the supplied uploads playlist", async () => {
  const result = await youtubeDataReadonly.listVideos({
    accessToken: TOKEN,
    playlistId: "UU12345678901234567890",
    maxResults: 2,
    fetchImpl: fakeFetch({
      items: [{
        contentDetails: { videoId: VIDEO_ID, videoPublishedAt: "2026-01-01T00:00:00Z" },
        snippet: { title: "Test video", description: "Description", thumbnails: { medium: { url: "https://i.ytimg.com/example.jpg" } } }
      }],
      nextPageToken: "next_page_token"
    }, 200, (url, init) => {
      assert.equal(url.origin, "https://youtube.googleapis.com");
      assert.equal(url.pathname, "/youtube/v3/playlistItems");
      assert.equal(url.searchParams.get("maxResults"), "2");
      assert.equal(url.searchParams.get("playlistId"), "UU12345678901234567890");
      assert.equal(init.method, "GET");
    })
  });
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].videoId, VIDEO_ID);
  assert.equal(result.nextPageToken, "next_page_token");
});

test("video statistics batches up to 50 IDs in a read-only request", async () => {
  const result = await youtubeDataReadonly.getVideoStats({
    accessToken: TOKEN,
    videoIds: [VIDEO_ID],
    fetchImpl: fakeFetch({
      items: [{
        id: VIDEO_ID,
        snippet: { title: "Video" },
        contentDetails: { duration: "PT1M30S" },
        statistics: { viewCount: "99", likeCount: "7", commentCount: "2" }
      }]
    }, 200, (url, init) => {
      assert.equal(url.pathname, "/youtube/v3/videos");
      assert.equal(url.searchParams.get("id"), VIDEO_ID);
      assert.equal(init.method, "GET");
    })
  });
  assert.equal(result.videos[0].viewCount, 99);
  assert.equal(result.videos[0].duration, "PT1M30S");
});

test("analytics uses channel==MINE and rejects unapproved metrics or dimensions", async () => {
  const result = await youtubeDataReadonly.getAnalytics({
    accessToken: TOKEN,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    metrics: "views,estimatedMinutesWatched",
    dimensions: "day",
    fetchImpl: fakeFetch({
      columnHeaders: [{ name: "day" }, { name: "views" }],
      rows: [["2026-01-01", 20]]
    }, 200, (url, init) => {
      assert.equal(url.origin, "https://youtubeanalytics.googleapis.com");
      assert.equal(url.pathname, "/v2/reports");
      assert.equal(url.searchParams.get("ids"), "channel==MINE");
      assert.equal(url.searchParams.get("metrics"), "views,estimatedMinutesWatched");
      assert.equal(init.method, "GET");
    })
  });
  assert.equal(result.rowCount, 1);
  await assert.rejects(() => youtubeDataReadonly.getAnalytics({
    accessToken: TOKEN, startDate: "2026-01-01", endDate: "2026-01-31",
    metrics: "views;delete"
  }), /unsupported_analytics_metrics/);
  await assert.rejects(() => youtubeDataReadonly.getAnalytics({
    accessToken: TOKEN, startDate: "2026-01-01", endDate: "2026-01-31",
    metrics: "views", dimensions: "video;private"
  }), /unsupported_analytics_dimensions/);
});

test("invalid IDs, page bounds and date ranges fail before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("network must not be called"); };
  await assert.rejects(() => youtubeDataReadonly.listVideos({
    accessToken: TOKEN, playlistId: "../private", fetchImpl
  }), /invalid_uploads_playlist_id/);
  await assert.rejects(() => youtubeDataReadonly.listVideos({
    accessToken: TOKEN, playlistId: "UU12345678901234567890", maxResults: 51, fetchImpl
  }), /max_results_out_of_range/);
  await assert.rejects(() => youtubeDataReadonly.getVideoStats({
    accessToken: TOKEN, videoIds: ["../delete"], fetchImpl
  }), /video_ids_must_be_1_to_50_unique_ids/);
  await assert.rejects(() => youtubeDataReadonly.getAnalytics({
    accessToken: TOKEN, startDate: "2026-02-01", endDate: "2026-01-01", metrics: "views", fetchImpl
  }), /start_date_after_end_date/);
  assert.equal(calls, 0);
});

test("missing or malformed server token is rejected before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("network must not be called"); };
  await assert.rejects(() => youtubeDataReadonly.getChannel({ fetchImpl }), /valid_server_access_token_required/);
  await assert.rejects(() => youtubeDataReadonly.getChannel({ accessToken: "too short", fetchImpl }), /valid_server_access_token_required/);
  assert.equal(calls, 0);
});

test("provider errors are sanitized and do not include upstream response bodies", async () => {
  await assert.rejects(
    () => youtubeDataReadonly.getChannel({ accessToken: TOKEN, fetchImpl: fakeFetch({ error: "private detail" }, 401) }),
    (error) => error.message === "google_access_token_rejected" && !error.message.includes("private detail")
  );
  await assert.rejects(
    () => youtubeDataReadonly.getChannel({ accessToken: TOKEN, fetchImpl: fakeFetch({}, 403) }),
    /google_api_access_denied_or_quota_exceeded/
  );
});

test("no write methods or publishing capabilities are exported", () => {
  assert.deepEqual(Object.keys(youtubeDataReadonly).sort(), [
    "capabilities", "getAnalytics", "getChannel", "getVideoStats", "listVideos", "mode", "providerId"
  ]);
  assert.equal(youtubeDataReadonly.mode, "read-only");
  assert.equal(youtubeDataReadonly.capabilities.some((value) => /write|publish|delete|upload/i.test(value)), false);
});
