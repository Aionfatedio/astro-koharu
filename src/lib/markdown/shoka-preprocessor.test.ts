import assert from 'node:assert/strict';
import test from 'node:test';
import { preprocessShokaSyntax } from './shoka-preprocessor';

test('accepts legacy media blocks with unindented item properties', () => {
  const output = preprocessShokaSyntax(`{% media video %}
- name: "测试视频"
url: "/media/test.mp4"
{% endmedia %}`);

  assert.match(output, /class="artplayer-container"/);
  assert.match(output, /data-video-src="\/media\/test\.mp4"/);
  assert.doesNotMatch(output, /Failed to parse media YAML/);
});
