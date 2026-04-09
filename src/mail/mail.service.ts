import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: BrevoClient;
  private readonly fromEmail: string;

  constructor(private config: ConfigService) {
    this.client = new BrevoClient({
      apiKey: this.config.getOrThrow<string>('BREVO_API_KEY'),
    });
    this.fromEmail = this.config.getOrThrow<string>('BREVO_FROM_EMAIL');
  }

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    try {
      await this.client.transactionalEmails.sendTransacEmail({
        sender: { name: 'Vybe', email: this.fromEmail },
        to: [{ email: to }],
        subject: 'Vybe — Verify your email',
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Verify your email</h2>
            <p>Use the code below to verify your Vybe account. It expires in 15 minutes.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center;
                        padding: 24px; background: #f5f5f5; border-radius: 8px; margin: 24px 0;">
              ${code}
            </div>
            <p style="color: #888; font-size: 13px;">If you did not create a Vybe account, ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
      throw error;
    }
  }

  async sendPasswordResetEmail(to: string, code: string): Promise<void> {
    try {
      await this.client.transactionalEmails.sendTransacEmail({
        sender: { name: 'Vybe', email: this.fromEmail },
        to: [{ email: to }],
        subject: 'Vybe — Reset your password',
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Reset your password</h2>
            <p>Use the code below to reset your Vybe password. It expires in 15 minutes.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center;
                        padding: 24px; background: #f5f5f5; border-radius: 8px; margin: 24px 0;">
              ${code}
            </div>
            <p style="color: #888; font-size: 13px;">If you did not request a password reset, ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
      throw error;
    }
  }
}
