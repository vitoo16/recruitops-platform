import type {
  Destination,
  ManualDistributionChecklistCode,
  ManualDistributionInstruction,
  ManualDistributionProvider,
  PublishCommand,
} from '@recruitops/contracts';

export interface DestinationResolver {
  findById(destinationId: string): Promise<Destination | null>;
}

export class ManualDestinationNotFoundError extends Error {
  constructor(destinationId: string) {
    super(`Manual distribution destination not found: ${destinationId}`);
    this.name = 'ManualDestinationNotFoundError';
  }
}

export class ManualDestinationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualDestinationUnavailableError';
  }
}

export function formatManualDistributionCopy(command: PublishCommand): string {
  const sections: string[] = [];
  const text = command.payload.text.trim();
  if (text) sections.push(text);

  const hashtags = command.payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

  if (hashtags.length) sections.push(hashtags.join(' '));
  if (command.payload.link) sections.push(command.payload.link);

  return sections.join('\n\n');
}

export class DefaultManualDistributionProvider implements ManualDistributionProvider {
  constructor(private readonly destinations: DestinationResolver) {}

  async prepare(command: PublishCommand): Promise<ManualDistributionInstruction> {
    const destination = await this.destinations.findById(command.destinationId);
    if (!destination) throw new ManualDestinationNotFoundError(command.destinationId);

    if (!destination.enabled) {
      throw new ManualDestinationUnavailableError('Destination is disabled');
    }

    if (destination.postingMode !== 'MANUAL') {
      throw new ManualDestinationUnavailableError(
        'Destination is configured for API publishing, not Manual Assist',
      );
    }

    if (destination.platform !== command.platform) {
      throw new ManualDestinationUnavailableError(
        'Publish command platform does not match destination platform',
      );
    }

    const checklist: ManualDistributionChecklistCode[] = ['OPEN_DESTINATION'];
    if (command.payload.mediaIds?.length) checklist.push('ATTACH_MEDIA');
    checklist.push('PASTE_CONTENT', 'REVIEW_CONTENT', 'PUBLISH_MANUALLY', 'CONFIRM_PUBLICATION');

    const instruction: ManualDistributionInstruction = {
      destinationId: destination.id,
      copyText: formatManualDistributionCopy(command),
      checklist,
    };

    if (destination.url) instruction.destinationUrl = destination.url;
    return instruction;
  }
}
