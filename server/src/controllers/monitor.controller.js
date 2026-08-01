'use strict';

const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/monitor.service');

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  method: z.enum(['GET', 'HEAD', 'POST']).default('GET'),
  intervalSeconds: z.coerce.number().int().min(30).default(60),
  expectedStatus: z.coerce.number().int().min(100).max(599).default(200),
  timeoutMs: z.coerce.number().int().min(1000).max(60000).default(10000),
  isActive: z.boolean().default(true),
});

// Every field optional for PATCH; at least one required.
const updateSchema = createSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Provide at least one field to update',
});

/** The owner always comes from the verified session. Taking it from the body
 * or a query param would let a caller act on another account. */
const owner = (req) => req.user.id;

const list = asyncHandler(async (req, res) => {
  res.json(await service.listMonitors(owner(req)));
});

const overview = asyncHandler(async (req, res) => {
  res.json(await service.getOverview(owner(req)));
});

const checkNow = asyncHandler(async (req, res) => {
  res.json(await service.checkNow(req.params.id, owner(req)));
});

const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createMonitor(req.body, owner(req)));
});

const detail = asyncHandler(async (req, res) => {
  res.json(await service.getMonitor(req.params.id, owner(req)));
});

const update = asyncHandler(async (req, res) => {
  res.json(await service.updateMonitor(req.params.id, req.body, owner(req)));
});

const remove = asyncHandler(async (req, res) => {
  await service.deleteMonitor(req.params.id, owner(req));
  res.status(204).end();
});

const results = asyncHandler(async (req, res) => {
  res.json(await service.getResults(req.params.id, req.query.range, owner(req)));
});

const incidents = asyncHandler(async (req, res) => {
  res.json(await service.getIncidents(req.params.id, owner(req)));
});

module.exports = {
  createSchema,
  updateSchema,
  list,
  overview,
  checkNow,
  create,
  detail,
  update,
  remove,
  results,
  incidents,
};
