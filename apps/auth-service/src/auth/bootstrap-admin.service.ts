import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  async onModuleInit() {
    this.logger.warn(
      'BootstrapAdminService is deprecated and no longer runs. Use the Kubernetes Job (auth-admin-bootstrap) instead.',
    );
  }
}
