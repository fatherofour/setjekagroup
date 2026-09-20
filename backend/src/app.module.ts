import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ProjectNodesModule } from './project-nodes/project-nodes.module.js';
import { ProjectMembersModule } from './project-members/project-members.module.js';
import { ContractorsModule } from './contractors/contractors.module.js';
import { OrganisationContactsModule } from './organisation-contacts/organisation-contacts.module.js';
import { ComplianceRecordsModule } from './compliance-records/compliance-records.module.js';
import { OrganisationAppointmentsModule } from './organisation-appointments/organisation-appointments.module.js';
import { PaymentRecordsModule } from './payment-records/payment-records.module.js';
import { OrganisationRatingsModule } from './organisation-ratings/organisation-ratings.module.js';
import { ScheduleModule } from './schedule/schedule.module.js';
import { ProjectTasksModule } from './project-tasks/project-tasks.module.js';
import { ProjectIssuesModule } from './project-issues/project-issues.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProjectDashboardModule } from './project-dashboard/project-dashboard.module.js';
import { DocumentFoldersModule } from './document-folders/document-folders.module.js';
import { ProjectDocumentsModule } from './project-documents/project-documents.module.js';
import { TransmittalsModule } from './transmittals/transmittals.module.js';
import { ProjectRisksModule } from './project-risks/project-risks.module.js';
import { RfisModule } from './rfis/rfis.module.js';
import { SubmittalsModule } from './submittals/submittals.module.js';
import { PermissionsModule } from './permissions/permissions.module.js';
import { AuditLogModule } from './audit-log/audit-log.module.js';
import { AuditLogInterceptor } from './audit-log/interceptors/audit-log.interceptor.js';
import { StageTransitionsModule } from './stage-transitions/stage-transitions.module.js';
import { RfqsModule } from './rfqs/rfqs.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { VendorScorecardsModule } from './vendor-scorecards/vendor-scorecards.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    ProjectNodesModule,
    ProjectMembersModule,
    ContractorsModule,
    OrganisationContactsModule,
    ComplianceRecordsModule,
    OrganisationAppointmentsModule,
    PaymentRecordsModule,
    OrganisationRatingsModule,
    ScheduleModule,
    ProjectTasksModule,
    ProjectIssuesModule,
    CommentsModule,
    NotificationsModule,
    ProjectDashboardModule,
    DocumentFoldersModule,
    ProjectDocumentsModule,
    TransmittalsModule,
    ProjectRisksModule,
    RfisModule,
    SubmittalsModule,
    PermissionsModule,
    AuditLogModule,
    StageTransitionsModule,
    RfqsModule,
    QuotesModule,
    PurchaseOrdersModule,
    DeliveriesModule,
    VendorScorecardsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }],
})
export class AppModule {}
