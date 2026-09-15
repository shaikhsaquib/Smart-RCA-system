import { Request, Response } from 'express';
import { requireMongo } from './requireMongo';

const mockIsMongoConnected = jest.fn();
jest.mock('../config/db', () => ({
  isMongoConnected: () => mockIsMongoConnected(),
}));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireMongo middleware', () => {
  beforeEach(() => mockIsMongoConnected.mockReset());

  it('responds 503 with a feature-disabled body when Mongo is not connected', () => {
    mockIsMongoConnected.mockReturnValue(false);
    const res = mockRes();
    const next = jest.fn();

    requireMongo({} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'disabled', error: expect.stringContaining('MongoDB') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when Mongo is connected', () => {
    mockIsMongoConnected.mockReturnValue(true);
    const res = mockRes();
    const next = jest.fn();

    requireMongo({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
