export declare class PaginationDto {
    page?: number;
    pageSize?: number;
    limit?: number;
    takeParam?: number;
    get skip(): number;
    get take(): number;
}
export declare class SortDto {
    sort?: 'asc' | 'desc';
}
