'use strict';

const express = require('express');
const validate = require('../middleware/validate.middleware');
const c = require('../controllers/monitor.controller');

const router = express.Router();

router.get('/', c.list);
router.post('/', validate(c.createSchema), c.create);
router.post('/:id/check', c.checkNow);
router.get('/:id', c.detail);
router.patch('/:id', validate(c.updateSchema), c.update);
router.delete('/:id', c.remove);
router.get('/:id/results', c.results);
router.get('/:id/incidents', c.incidents);

module.exports = router;
