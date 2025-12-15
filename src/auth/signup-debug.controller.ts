import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { InternalSecretGuard } from "../common/guards/internal-secret.guard";

@ApiTags("Internal")
@UseGuards(InternalSecretGuard)
@Controller({ path: "internal/debug", version: ["1", "2"] })
export class SignupDebugController {
  constructor(private readonly service: AuthService) {}

  @Get("signup-session/:id")
  async getDebug(@Param("id") id: string): Promise<any> {
    return this.service.debugSignupSession(id);
  }
}
