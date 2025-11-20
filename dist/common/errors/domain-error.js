"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainError = void 0;
const common_1 = require("@nestjs/common");
class DomainError extends Error {
    constructor(code, userMessage, httpStatus = common_1.HttpStatus.BAD_REQUEST, details) {
        super(userMessage);
        this.code = code;
        this.userMessage = userMessage;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = 'DomainError';
    }
}
exports.DomainError = DomainError;
//# sourceMappingURL=domain-error.js.map