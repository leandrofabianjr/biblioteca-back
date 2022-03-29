import { UseFilters } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { isUUID, validate } from 'class-validator';
import { DeepPartial, FindOptionsWhere, Raw, Repository } from 'typeorm';
import { ServiceException } from '../exceptions/service.exception';
import { ApiExceptionFilter } from '../filters/api-exception.filter';
import { PaginatedResponse } from '../interfaces/paginated-response';
import { PaginatedServiceFilters } from '../interfaces/paginated-service-filters';
import { RepositoryEntity } from './repository-entity';

@UseFilters(ApiExceptionFilter)
export abstract class RepositoryService<
  T extends RepositoryEntity,
  T_DTO extends object,
> {
  constructor(public repository: Repository<T>) {}

  abstract dtoConstructor: ClassConstructor<T_DTO>;

  private async validateDto(json: T_DTO): Promise<T_DTO> {
    const dto = plainToInstance(this.dtoConstructor, json);
    const errors = await validate(dto);

    if (errors.length) {
      const message = 'Por favor, confira os dados preenchidos.';
      throw new ServiceException({ message, errors });
    }

    return dto;
  }

  private buildOptionsToFilter(
    options?: PaginatedServiceFilters<T>,
  ): PaginatedServiceFilters<T> {
    if (options?.searchFields?.length && options?.search?.length) {
      options.where = {};
      options.searchFields.forEach((field) => {
        options.where[field] = Raw((v) => `LOWER(${v}) Like LOWER(:value)`, {
          value: `%${options.search}%`,
        });
      });
      delete options.search;
    }
    return options;
  }

  abstract buildPartial(dto: T_DTO): Promise<DeepPartial<T>>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validateBeforeCreate(dto: T_DTO) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async validateBeforeEdit(uuid: string, dto: T_DTO) {
    return;
  }

  get(uuid: string): Promise<T> {
    if (!isUUID(uuid)) {
      return new Promise((resolve) => resolve(null));
    }
    return this.repository.findOneBy({ uuid } as FindOptionsWhere<T>);
  }

  async filter(
    options?: PaginatedServiceFilters<T>,
  ): Promise<PaginatedResponse<T>> {
    const opt = this.buildOptionsToFilter(options);
    const [data, total] = await this.repository.findAndCount(opt);

    const res: PaginatedResponse<T> = {
      data,
      total,
      limit: opt?.take,
      offset: opt?.skip,
    };
    return res;
  }

  save(model: T): Promise<T> {
    return this.repository.save(model as DeepPartial<T>)[0];
  }

  async create(data: T_DTO): Promise<T> {
    const dto = await this.validateDto(data);

    await this.validateBeforeCreate(dto);

    const model = await this.buildPartial(dto);

    return await this.repository.save(model);
  }

  async edit(uuid: string, data: T_DTO) {
    const dto = await this.validateDto(data);

    await this.validateBeforeEdit(uuid, dto);

    const model = await this.buildPartial(dto);
    model.uuid = uuid;
    return this.repository.save(model);
  }

  async remove(uuid: string): Promise<{ affected: number }> {
    const result = await this.repository.softDelete(uuid);
    return { affected: result.affected };
  }
}
