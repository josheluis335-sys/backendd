import { Module } from '@nestjs/common';
import { TestAuthController } from './test-auth.controller.js';

@Module({
  controllers: [TestAuthController],
})
export class TestAuthModule {}
