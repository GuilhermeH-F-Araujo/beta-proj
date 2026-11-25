import { z } from 'zod';

export const consultaOrdensSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    search: z.string().trim().max(100).default(''),
    status: z
      .enum([
        'todos',
        'aguardando',
        'em andamento',
        'aguardando peça',
        'pronto',
        'entregue',
        'cancelada',
      ])
      .default('todos'),
    period: z.enum(['todos', '7d', '30d', 'mes']).default('todos'),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    clientId: z.coerce.number().int().positive().optional(),
  })
  .refine((valor) => {
    if (!valor.dateFrom && !valor.dateTo) return true;
    if (!valor.dateFrom || !valor.dateTo || valor.dateFrom > valor.dateTo) return false;
    return [valor.dateFrom, valor.dateTo].every(
      (dadosLocal) =>
        !Number.isNaN(Date.parse(`${dadosLocal}T12:00:00Z`)) &&
        new Date(`${dadosLocal}T12:00:00Z`).toISOString().slice(0, 10) === dadosLocal,
    );
  });

export const criarOrdemSchema = z
  .object({
    clientId: z.number().int().positive().nullable(),
    clientName: z.string().trim().max(100),
    clientPhone: z.string().trim().max(20),
    clientEmail: z.union([z.email().max(150), z.literal('')]),
    clientCpf: z.union([z.string().regex(/^\d{11}$/), z.literal('')]),
    motorcycleId: z.number().int().positive().nullable(),
    model: z.string().trim().max(100),
    plate: z.string().trim().toUpperCase().max(10),
    year: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .nullable(),
    color: z.string().trim().max(50),
    mileage: z.number().int().min(0).max(2_000_000).nullable(),
    mechanicId: z.number().int().positive().nullable(),
    entryAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    forecastAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), z.literal('')]),
    noForecastConfirmed: z.boolean().optional(),
    photoCaptureVersion: z.literal(2).optional(),
    problem: z.string().trim().min(3).max(255),
    observations: z.string().trim().max(255),
    services: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    photos: z
      .array(
        z.object({
          position: z.enum(['front', 'left', 'rear', 'right', 'extra']).optional(),
          data: z.string().max(750_000),
        }),
      )
      .max(8),
  })
  .superRefine((entrada, contexto) => {
    if (entrada.photoCaptureVersion === 2) {
      if (!entrada.services?.length)
        contexto.addIssue({
          code: 'custom',
          message: 'Selecione ao menos um serviço previsto para a ordem.',
          path: ['services'],
        });
      if (!entrada.forecastAt && !entrada.noForecastConfirmed)
        contexto.addIssue({
          code: 'custom',
          message: 'Informe uma previsão ou confirme que ela será comunicada depois.',
          path: ['forecastAt'],
        });
      if (entrada.photos.length < 4)
        contexto.addIssue({
          code: 'custom',
          message: 'Envie as quatro fotos obrigatórias da motocicleta.',
          path: ['photos'],
        });
      const obrigatorias = ['front', 'left', 'rear', 'right'];
      const informadas = entrada.photos.map((foto) => foto.position);
      if (informadas.some((posicao) => !posicao))
        contexto.addIssue({
          code: 'custom',
          message: 'Identifique a posição de cada foto da motocicleta.',
          path: ['photos'],
        });
      for (const posicao of obrigatorias) {
        if (informadas.filter((atual) => atual === posicao).length !== 1)
          contexto.addIssue({
            code: 'custom',
            message: 'Envie uma foto obrigatória de cada lado da motocicleta.',
            path: ['photos'],
          });
      }
      if (entrada.photos.filter((foto) => foto.position === 'extra').length > 4)
        contexto.addIssue({
          code: 'custom',
          message: 'A OS aceita no máximo quatro fotos extras.',
          path: ['photos'],
        });
    }
    if (
      !entrada.clientId &&
      (entrada.clientName.length < 2 || entrada.clientPhone.replace(/\D/g, '').length < 10)
    )
      contexto.addIssue({
        code: 'custom',
        message: 'Informe o nome e um telefone válido do cliente.',
      });
    if (
      !entrada.motorcycleId &&
      (entrada.model.length < 2 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(entrada.plate))
    )
      contexto.addIssue({
        code: 'custom',
        message: 'Informe o modelo e uma placa válida para a moto.',
      });
    if (entrada.forecastAt && entrada.forecastAt < entrada.entryAt)
      contexto.addIssue({
        code: 'custom',
        message: 'A previsão deve ser posterior à data de entrada.',
      });
  });

export const motocicletaSchema = z
  .object({
    clientId: z.number().int().positive(),
    model: z.string().trim().min(2).max(100),
    plate: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/),
    year: z.number().int().min(1900).max(2100).nullable(),
    modelYear: z.number().int().min(1900).max(2100).nullable(),
    color: z.string().trim().max(40),
    mileage: z.number().int().min(0).max(10_000_000).nullable(),
    chassis: z.string().trim().max(17),
    renavam: z
      .string()
      .trim()
      .regex(/^(?:\d{11})?$/),
    notes: z.string().trim().max(1000),
    active: z.boolean(),
  })
  .strict();

export const cadastrarFuncionarioSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().max(150),
    phone: z
      .string()
      .trim()
      .refine((valor) => valor.replace(/\D/g, '').length >= 10 && valor.length <= 20),
    cpf: z.string().regex(/^\d{11}$/),
    position: z.enum(['Administrador', 'Cliente', 'Mecânico']),
    profile: z.enum(['Administrador', 'Cliente', 'Mecânico']),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/\d/)
      .regex(/[^\w\s]/),
  })
  .refine((valor) => valor.position === valor.profile, {
    message: 'Cargo e perfil de acesso devem corresponder.',
  });

export const corrigirOrdemSchema = z
  .object({
    client: z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().trim().max(20),
        email: z.union([z.email().max(150), z.literal('')]),
        cpf: z
          .string()
          .trim()
          .max(20)
          .refine(
            (valor) =>
              !valor || (/^[\d.\-\s]+$/.test(valor) && valor.replace(/\D/g, '').length === 11),
          ),
      })
      .strict(),
    motorcycle: z
      .object({
        model: z.string().trim().min(2).max(100),
        plate: z
          .string()
          .trim()
          .min(5)
          .max(10)
          .regex(/^[A-Za-z0-9-]+$/),
        year: z.number().int().min(1900).max(2100).nullable(),
        color: z.string().trim().max(50),
      })
      .strict(),
    problem: z.string().trim().max(2000),
    observations: z.string().trim().max(2000),
  })
  .strict();
