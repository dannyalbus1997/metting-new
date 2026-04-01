import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /**
   * Find a user by their MongoDB ID
   */
  async findById(id: string): Promise<UserDocument> {
    try {
      const user = await this.userModel.findById(id).exec();
      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find user by ID');
    }
  }

  /**
   * Find a user by their Microsoft ID
   */
  async findByMicrosoftId(microsoftId: string): Promise<UserDocument | null> {
    try {
      return await this.userModel.findOne({ microsoftId }).exec();
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by Microsoft ID');
    }
  }

  /**
   * Find a user by their email address
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    try {
      return await this.userModel.findOne({ email: email.toLowerCase() }).exec();
    } catch (error) {
      throw new InternalServerErrorException('Failed to find user by email');
    }
  }

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    try {
      const existingUser = await this.userModel.findOne({
        $or: [
          { email: createUserDto.email.toLowerCase() },
          { microsoftId: createUserDto.microsoftId },
        ],
      }).exec();

      if (existingUser) {
        throw new BadRequestException('User with this email or Microsoft ID already exists');
      }

      const user = new this.userModel({
        ...createUserDto,
        email: createUserDto.email.toLowerCase(),
      });

      return await user.save();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  /**
   * Update user's tokens (access and refresh tokens)
   */
  async updateTokens(
    id: string,
    accessToken: string|null,
    refreshToken: string|null,
  ): Promise<UserDocument> {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          id,
          {
            accessToken,
            refreshToken,
            updatedAt: new Date(),
          },
          { new: true },
        )
        .exec();

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update user tokens');
    }
  }

  /**
   * Find an existing user or create a new one if not exists
   */
  async findOrCreate(createUserDto: CreateUserDto): Promise<UserDocument> {
    try {
      // First try to find by Microsoft ID
      let user = await this.findByMicrosoftId(createUserDto.microsoftId);

      if (user) {
        return await this.updateTokens(
          user._id.toString(),
          createUserDto.accessToken,
          createUserDto.refreshToken,
        );
      }

      // Check if user exists by email
      user = await this.findByEmail(createUserDto.email);

      if (user) {
        const updatedUser = await this.userModel
          .findByIdAndUpdate(
            user._id,
            {
              microsoftId: createUserDto.microsoftId,
              accessToken: createUserDto.accessToken,
              refreshToken: createUserDto.refreshToken,
              updatedAt: new Date(),
            },
            { new: true },
          )
          .exec();

        if (!updatedUser) {
          throw new InternalServerErrorException('Failed to update user');
        }

        return updatedUser;
      }

      // Create new user
      return await this.create(createUserDto);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to find or create user');
    }
  }

  /**
   * Update user profile information
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    try {
      const user = await this.userModel
        .findByIdAndUpdate(
          id,
          {
            ...updateUserDto,
            updatedAt: new Date(),
          },
          { new: true },
        )
        .exec();

      if (!user) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  /**
   * Get all users
   */
  async findAll(): Promise<UserDocument[]> {
    try {
      return await this.userModel.find().exec();
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch users');
    }
  }

  /**
   * Update Microsoft-specific profile data
   */
  async updateMicrosoftProfile(
    userId: string,
    profile: { microsoftId: string; displayName: string },
  ): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      microsoftId: profile.microsoftId,
      name: profile.displayName,
      updatedAt: new Date(),
    }).exec();
  }

  /**
   * Find or create by email (simplified version for auth flow)
   */
  async findOrCreateByEmail(
    email: string,
    profile: any,
  ): Promise<UserDocument> {
    let user = await this.findByEmail(email);
    if (user) {
      return user;
    }

    const newUser = new this.userModel({
      email: email.toLowerCase(),
      name: profile.displayName || email,
      microsoftId: profile.microsoftId || '',
      accessToken: '',
      refreshToken: '',
    });

    return await newUser.save();
  }
}
