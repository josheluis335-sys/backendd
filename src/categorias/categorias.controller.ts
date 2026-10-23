import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyRole, Roles } from '../common/decorators/roles.decorator.js';
import { UserRole } from '../common/enums/user-role.enum.js';
import { CategoriasService } from './categorias.service.js';
import { CreateCategoriaDto } from './dto/create-categoria.dto.js';
import { ListCategoriasDto } from './dto/list-categorias.dto.js';
import { UpdateCategoriaDto } from './dto/update-categoria.dto.js';
import { WriteThrottleGuard } from '../usuarios/guards/write-throttle.guard.js';

@ApiTags('categorías')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Get()
  @AnyRole()
  @ApiOperation({ summary: 'Listar categorías' })
  findAll(@Query() query: ListCategoriasDto) {
    return this.categoriasService.findAll(query.activa);
  }

  @Get(':id/area-sugerida')
  @AnyRole()
  @ApiOperation({ summary: 'Consultar el área sugerida de una categoría' })
  findSuggestedArea(@Param('id') id: string) {
    return this.categoriasService.findSuggestedArea(id);
  }

  @Get(':id')
  @AnyRole()
  @ApiOperation({ summary: 'Consultar una categoría por id' })
  findById(@Param('id') id: string) {
    return this.categoriasService.findById(id);
  }

  @Post()
  @UseGuards(WriteThrottleGuard)
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear una categoría' })
  create(@Body() dto: CreateCategoriaDto) {
    return this.categoriasService.create(dto);
  }

  @Patch(':id')
  @UseGuards(WriteThrottleGuard)
  @Roles(UserRole.ADMINISTRADOR)
  @ApiOperation({ summary: 'Editar o activar/desactivar una categoría' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoriaDto) {
    return this.categoriasService.update(id, dto);
  }
}
