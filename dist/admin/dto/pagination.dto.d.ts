export declare class PaginationDto {
    page?: number;
    pageSize?: number;
    get skip(): number;
    get take(): number;
}
export declare class SortDto {
    sort?: 'asc' | 'desc';
}
