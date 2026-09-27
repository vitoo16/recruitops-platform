import { describe, expect, it } from 'vitest';
import type { Destination, PublishCommand } from '@recruitops/contracts';
import {
  DefaultManualDistributionProvider,
  ManualDestinationUnavailableError,
  type DestinationResolver,
} from './manual-distribution.js';

const manualDestination: Destination = {
  id: 'dc733d99-dda5-4bf7-a0e1-16e3d5aa9043',
  platform: 'FACEBOOK',
  type: 'GROUP',
  name: 'Recruitment community',
  url: 'https://example.com/groups/recruitment',
  postingMode: 'MANUAL',
  enabled: true,
  tags: ['recruitment'],
};

const command: PublishCommand = {
  platform: 'FACEBOOK',
  socialAccountId: '78a91077-c00e-4e63-ad91-26affdb65373',
  destinationId: manualDestination.id,
  idempotencyKey: 'publication:test',
  payload: {
    text: 'We are hiring a Frontend Developer.',
    hashtags: ['hiring', '#frontend'],
    link: 'https://example.com/jobs/frontend',
    mediaIds: ['media-1'],
  },
};

function resolverFor(destination: Destination): DestinationResolver {
  return {
    async findById(destinationId) {
      return destinationId === destination.id ? destination : null;
    },
  };
}

describe('DefaultManualDistributionProvider', () => {
  it('prepares copy and stable checklist codes for a manual destination', async () => {
    const provider = new DefaultManualDistributionProvider(resolverFor(manualDestination));

    await expect(provider.prepare(command)).resolves.toEqual({
      destinationId: manualDestination.id,
      destinationUrl: manualDestination.url,
      copyText:
        'We are hiring a Frontend Developer.\n\n#hiring #frontend\n\nhttps://example.com/jobs/frontend',
      checklist: [
        'OPEN_DESTINATION',
        'ATTACH_MEDIA',
        'PASTE_CONTENT',
        'REVIEW_CONTENT',
        'PUBLISH_MANUALLY',
        'CONFIRM_PUBLICATION',
      ],
    });
  });

  it('rejects destinations configured for API publishing', async () => {
    const provider = new DefaultManualDistributionProvider(
      resolverFor({ ...manualDestination, postingMode: 'API' }),
    );

    await expect(provider.prepare(command)).rejects.toBeInstanceOf(
      ManualDestinationUnavailableError,
    );
  });

  it('rejects a platform mismatch instead of silently posting to the wrong destination', async () => {
    const provider = new DefaultManualDistributionProvider(
      resolverFor({ ...manualDestination, platform: 'LINKEDIN' }),
    );

    await expect(provider.prepare(command)).rejects.toBeInstanceOf(
      ManualDestinationUnavailableError,
    );
  });
});
