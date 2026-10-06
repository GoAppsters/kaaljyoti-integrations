import { describe, expect, it } from 'vitest';
import { ownerLink, PRICING_URL } from '../src/core/config.ts';
import { proxyStateHtml } from '../src/core/ui.ts';

describe('the site owner links on the plan and proxy cards', () => {
  it('reads off as no link, a safe URL as itself, anything else as the fallback', () => {
    expect(ownerLink('off', PRICING_URL)).toBeNull();
    expect(ownerLink('OFF', PRICING_URL)).toBeNull();
    expect(ownerLink('https://example.com/plans', PRICING_URL)).toBe('https://example.com/plans');
    expect(ownerLink('javascript:alert(1)', PRICING_URL)).toBe(PRICING_URL);
    expect(ownerLink(undefined, null)).toBeNull();
  });

  it('draws the proxy card without the owner line when there is no link', () => {
    expect(proxyStateHtml('en', null)).not.toContain('<a');
    expect(proxyStateHtml('en', null)).not.toContain('proxy-owner');
    expect(proxyStateHtml('en', 'https://example.com/docs')).toContain('https://example.com/docs');
  });
});
