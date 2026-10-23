import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyRole, Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { ListAreasDto } from './dto/list-areas.dto.js';
import { UpdateAreaDto } from './dto/update-area.dto.js';
import { AreasService } from './areas.service.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';

@ApiTags('áreas')
@ApiBearerAuth()
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  @AnyRole()
  @ApiOperation({ summary: 'Listar áreas de soporte' })
  findAll(@Query() query: ListAreasDto) {
    return this.areasService.findAll(query.activa);
  }

  @Get(':id')
  @AnyRole()
  @ApiOperation({ summary: 'Consultar un área por id' })
  findById(@Param('id') id: string) {
    return this.areasService.findById(id);
  }

  @Post()
  @UseGuards(WriteThrottleGuard)
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear un área' })
  create(@Body() dto: CreateAreaDto) {
    return this.areasService.create(dto);
  }

  @Patch(':id')
  @UseGuards(WriteThrottleGuard)
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar o activar/desactivar un área' })
  update(@Param('id') id: string, @Body() dto: UpdateAreaDto) {
    return this.areasService.update(id, dto);
  }
}
