import { checkMongoData } from './mongoStage';

describe('checkMongoData - mock mode (no RCA_MONGODB_URI configured)', () => {
  it('flags found=true (mocked) when ticket language suggests a data issue', async () => {
    const result = await checkMongoData({
      ticketId: 'T1',
      summary: 'Bank details null',
      description: 'Supplier bank detail fields are showing null after the update.',
    });
    expect(result.found).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.stage).toBe('mongo');
  });

  it('flags found=false when ticket language does not suggest a data issue', async () => {
    const result = await checkMongoData({
      ticketId: 'T2',
      summary: 'How do I add a contact',
      description: 'Where is the option to add a new supplier contact?',
    });
    expect(result.found).toBe(false);
    expect(result.mocked).toBe(true);
  });
});
