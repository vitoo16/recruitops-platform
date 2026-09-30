import { Injectable } from '@nestjs/common';
import { TikTokPublishingProvider } from '@recruitops/integrations';

@Injectable()
export class TikTokPublishingClientFactory {
  create(): TikTokPublishingProvider {
    return new TikTokPublishingProvider();
  }
}
